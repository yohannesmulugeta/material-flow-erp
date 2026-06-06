-- ============================================================================
-- Non-sales path #2 — Atomic damage / loss approval
--
--   approve_damage(p_damage_id) DEDUCTS the damaged/lost quantity from inventory,
--   writes one stock_transactions row, and marks the damage record 'approved' —
--   all in ONE transaction with row locks and a state guard.
--
--   Deducts `quantity` only; never touches `reserved_quantity`. Matches inventory
--   by (product_id, warehouse_id) with variant_id IS NULL — damage_records has no
--   variant_id, so the null-variant row is targeted (unique per product+warehouse).
--
--   Unlike approve_return, this NEVER creates an inventory row: a damage against
--   stock that does not exist is a data error and must fail loudly.
--
--   The whole point of this RPC: replace the browser's
--       newQty = Math.max(0, inv.quantity - record.quantity)
--   which silently floored shortages to 0. Here, insufficient stock RAISES and
--   rolls back. No greatest(0,...), no clamp.
--
-- Does NOT change any sales-path RPC (reserve_stock, release_and_deduct,
-- quick_sale_deduct, reject_release) or approve_return. No schema change.
-- ============================================================================

create or replace function public.approve_damage(p_damage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dmg      public.damage_records%rowtype;
  v_inv      public.inventory_stocks%rowtype;
  v_wh_name  text;
  v_actor    uuid := auth.uid();
  v_actor_nm text;
  v_rows     int := 0;
begin
  -- 0. Argument guard
  if p_damage_id is null then
    raise exception 'approve_damage: damage_id is required';
  end if;

  -- 1. Load + lock the damage row
  select * into v_dmg from public.damage_records where id = p_damage_id for update;
  if not found then
    raise exception 'approve_damage: damage record % not found', p_damage_id
      using errcode = 'P0002';
  end if;

  -- 2. State guards (idempotency — approving twice must NOT deduct twice)
  if v_dmg.status = 'approved' then
    raise exception 'Damage record is already approved.' using errcode = 'P0001';
  end if;
  if v_dmg.status = 'rejected' then
    raise exception 'Damage record is already rejected.' using errcode = 'P0001';
  end if;

  -- 3. Required-field validation
  if v_dmg.product_id is null then
    raise exception 'approve_damage: damage % has no product_id', p_damage_id;
  end if;
  if v_dmg.warehouse_id is null then
    raise exception 'approve_damage: damage % has no warehouse_id', p_damage_id;
  end if;
  if coalesce(v_dmg.quantity, 0) <= 0 then
    raise exception 'approve_damage: damage % has quantity % — must be greater than 0',
      p_damage_id, v_dmg.quantity;
  end if;
  if v_dmg.type is null or v_dmg.type not in ('damage', 'loss') then
    raise exception 'approve_damage: damage % has invalid type "%" (expected damage or loss)',
      p_damage_id, v_dmg.type;
  end if;

  -- 4. Warehouse must exist
  select name into v_wh_name from public.warehouses where id = v_dmg.warehouse_id;
  if not found then
    raise exception 'approve_damage: warehouse % does not exist', v_dmg.warehouse_id
      using errcode = 'P0002';
  end if;

  -- 5. Lock the matching inventory row (product + warehouse, null variant).
  select * into v_inv
  from public.inventory_stocks
  where product_id = v_dmg.product_id
    and warehouse_id = v_dmg.warehouse_id
    and variant_id is null
  for update;

  -- 6. No inventory row → ERROR. Do NOT create one (cannot damage what is not there).
  if not found then
    raise exception 'approve_damage: no inventory record for product % in warehouse % — cannot write off stock that does not exist',
      coalesce(v_dmg.product_name, v_dmg.product_id::text),
      coalesce(v_wh_name, v_dmg.warehouse_id::text)
      using errcode = 'P0001';
  end if;

  -- 7. Insufficient stock → ERROR. This is the core fix (replaces Math.max(0,...)).
  if v_inv.quantity < v_dmg.quantity then
    raise exception 'Not enough stock to write off %: on hand %, damage/loss %.',
      coalesce(v_dmg.product_name, v_dmg.product_id::text),
      v_inv.quantity, v_dmg.quantity
      using errcode = 'P0001';
  end if;

  -- 8. Deduct quantity (relative, in SQL). reserved_quantity untouched.
  --    total_value_etb uses the OLD quantity expression (Postgres evaluates RHS
  --    against the pre-update row), so (quantity - n) gives the new value.
  update public.inventory_stocks
  set quantity        = quantity - v_dmg.quantity,                  -- relative, no clamp
      total_value_etb = (quantity - v_dmg.quantity) * avg_cost_etb,
      updated_at      = now()
  where id = v_inv.id;

  -- 9. Stock transaction (one row). unit cost from the inventory row's avg cost.
  insert into public.stock_transactions
    (product_id, product_name, warehouse_id, warehouse_name,
     type, reason, quantity, unit_cost_etb, reference_id, reference_type, created_by)
  values
    (v_dmg.product_id, v_dmg.product_name, v_dmg.warehouse_id, v_wh_name,
     'stock_out', v_dmg.type, v_dmg.quantity, v_inv.avg_cost_etb,
     p_damage_id::text, 'DamageRecord', v_actor);

  -- 10. Mark the damage approved (assert exactly one row updated)
  select full_name into v_actor_nm from public.profiles where id = v_actor;
  update public.damage_records
  set status      = 'approved',
      approved_by = coalesce(v_actor_nm, 'system'),
      updated_at  = now()
  where id = p_damage_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'approve_damage: expected to approve 1 damage row but updated %', v_rows
      using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.approve_damage(uuid) to authenticated, service_role;

-- ============================================================================
-- End. Frontend NOT wired yet. Deducts stock atomically and BLOCKS approval when
-- stock is insufficient (no silent clamp). Reject path (status-only) needs no RPC.
-- ============================================================================
