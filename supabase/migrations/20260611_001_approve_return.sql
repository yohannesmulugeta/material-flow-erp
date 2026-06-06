-- ============================================================================
-- Non-sales path #1 — Atomic sales-return approval
--
--   approve_return(p_return_id) adds the returned quantity back into inventory,
--   writes a stock_transactions row, and marks the return 'approved' — all in
--   ONE transaction with row locks and a state guard.
--
--   Adds stock_in only; never touches reserved_quantity. Matches inventory by
--   (product_id, warehouse_id) — sales_returns has no variant_id, so the
--   null-variant row is targeted (unique per product+warehouse).
--
-- Does NOT change any sales-path RPC (reserve_stock, release_and_deduct,
-- quick_sale_deduct, reject_release). No schema change.
-- ============================================================================

create or replace function public.approve_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ret    public.sales_returns%rowtype;
  v_inv    public.inventory_stocks%rowtype;
  v_wh_name text;
  v_actor  uuid := auth.uid();
  v_actor_nm text;
  v_rows   int := 0;
begin
  -- 0. Argument guard
  if p_return_id is null then
    raise exception 'approve_return: return_id is required';
  end if;

  -- 1. Load + lock the return row
  select * into v_ret from public.sales_returns where id = p_return_id for update;
  if not found then
    raise exception 'approve_return: return % not found', p_return_id using errcode = 'P0002';
  end if;

  -- 2. State guards (idempotency — approving twice must NOT add stock twice)
  if v_ret.status = 'approved' then
    raise exception 'Return is already approved.' using errcode = 'P0001';
  end if;
  if v_ret.status = 'rejected' then
    raise exception 'Return is already rejected.' using errcode = 'P0001';
  end if;

  -- 3. Required-field validation
  if v_ret.product_id is null then
    raise exception 'approve_return: return % has no product_id', p_return_id;
  end if;
  if v_ret.warehouse_id is null then
    raise exception 'approve_return: return % has no warehouse_id', p_return_id;
  end if;
  if coalesce(v_ret.quantity, 0) <= 0 then
    raise exception 'approve_return: return % has quantity % — must be greater than 0',
      p_return_id, v_ret.quantity;
  end if;

  -- Warehouse must exist (also gives us the name for a possible new row).
  select name into v_wh_name from public.warehouses where id = v_ret.warehouse_id;
  if not found then
    raise exception 'approve_return: warehouse % does not exist', v_ret.warehouse_id
      using errcode = 'P0002';
  end if;

  -- 4. Lock the matching inventory row (product + warehouse, null variant).
  select * into v_inv
  from public.inventory_stocks
  where product_id = v_ret.product_id
    and warehouse_id = v_ret.warehouse_id
    and variant_id is null
  for update;

  if found then
    -- add returned qty back; recompute value at the row's existing avg cost
    update public.inventory_stocks
    set quantity        = quantity + v_ret.quantity,                  -- relative, in SQL
        total_value_etb = (quantity + v_ret.quantity) * avg_cost_etb, -- uses OLD quantity (Postgres)
        updated_at      = now()
    where id = v_inv.id;
  else
    -- No existing inventory row: CREATE one (a return re-introduces stock).
    -- This fixes the current browser gap where the return was approved but the
    -- stock add was silently skipped when no row existed.
    insert into public.inventory_stocks
      (product_id, product_name, warehouse_id, warehouse_name,
       quantity, reserved_quantity, avg_cost_etb, total_value_etb, created_by)
    values
      (v_ret.product_id, v_ret.product_name, v_ret.warehouse_id, v_wh_name,
       v_ret.quantity, 0, coalesce(v_ret.unit_cost, 0),
       v_ret.quantity * coalesce(v_ret.unit_cost, 0), v_actor);
  end if;

  -- 5. Stock transaction (one row)
  insert into public.stock_transactions
    (product_id, product_name, warehouse_id, warehouse_name,
     type, reason, quantity, unit_cost_etb, reference_id, reference_type, created_by)
  values
    (v_ret.product_id, v_ret.product_name, v_ret.warehouse_id, v_wh_name,
     'stock_in', 'return', v_ret.quantity, v_ret.unit_cost,
     p_return_id::text, 'SalesReturn', v_actor);

  -- 6. Mark the return approved (assert exactly one row updated)
  select full_name into v_actor_nm from public.profiles where id = v_actor;
  update public.sales_returns
  set status      = 'approved',
      approved_by = coalesce(v_actor_nm, 'system'),
      updated_at  = now()
  where id = p_return_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'approve_return: expected to approve 1 return row but updated %', v_rows
      using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.approve_return(uuid) to authenticated, service_role;

-- ============================================================================
-- End. Frontend NOT wired yet. Adds returned stock atomically; reject path
-- (status-only) is unchanged and needs no RPC.
-- ============================================================================
