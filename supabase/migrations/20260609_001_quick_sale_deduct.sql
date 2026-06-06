-- ============================================================================
-- Phase 4 — Atomic quick (counter) sale deduction
--
--   quick_sale_deduct(p_warehouse_id, p_sale_id, p_items) deducts
--   inventory_stocks.quantity, recomputes total_value_etb, and inserts
--   stock_transactions in a SINGLE transaction with row locks.
--
--   Quick/counter sales do NOT reserve stock, so this NEVER touches
--   reserved_quantity. Safe replacement for the browser-side deduction loop in
--   NewSaleForm.saveSale (quick branch).
--
-- Does NOT touch: sales, customers, payments, accounts, warehouse_releases,
-- reserved_quantity. Standard reservation (reserve_stock) and warehouse
-- approval (release_and_deduct) are NOT changed. No schema change.
--
-- Validation/locking pattern mirrors reserve_stock:
--   PASS 0 validates every RAW line, then items are grouped by
--   (product_id, variant_id) and quantities summed; exact variant match via
--   `variant_id is not distinct from ...` (unique index → one row).
-- ============================================================================

create or replace function public.quick_sale_deduct(
  p_warehouse_id uuid,
  p_sale_id      uuid,
  p_items        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line   record;
  v_q      numeric;
  v_grp    record;
  v_inv    public.inventory_stocks%rowtype;
  v_actor  uuid := auth.uid();
  v_wh_name text;
  v_sale_exists boolean;
  v_n      int := 0;
begin
  -- 0. Argument guards
  if p_warehouse_id is null then
    raise exception 'quick_sale_deduct: warehouse_id is required';
  end if;
  if p_sale_id is null then
    raise exception 'quick_sale_deduct: sale_id is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'quick_sale_deduct: items must be a JSON array';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'quick_sale_deduct: no items to deduct';
  end if;

  -- 0a. Warehouse must exist — load its name into a variable for the
  --     stock_transactions inserts (never rely on INSERT..SELECT from warehouses,
  --     which would silently insert zero rows if the warehouse were missing).
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  if not found then
    raise exception 'quick_sale_deduct: warehouse % does not exist', p_warehouse_id
      using errcode = 'P0002';
  end if;

  -- 0b. Sale must exist (validate only — do NOT update it).
  select exists(select 1 from public.sales where id = p_sale_id) into v_sale_exists;
  if not v_sale_exists then
    raise exception 'quick_sale_deduct: sale % does not exist', p_sale_id
      using errcode = 'P0002';
  end if;

  -- ── PASS 0 — validate every RAW line before any grouping ──────────────────
  for v_line in
    select e, ord from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  loop
    -- product_id: present + valid uuid
    if (v_line.e->>'product_id') is null or btrim(v_line.e->>'product_id') = '' then
      raise exception 'quick_sale_deduct: line % is missing product_id', v_line.ord;
    end if;
    begin
      perform (v_line.e->>'product_id')::uuid;
    exception when others then
      raise exception 'quick_sale_deduct: line % has an invalid product_id "%"',
        v_line.ord, v_line.e->>'product_id';
    end;

    -- variant_id: optional, but if present must be a valid uuid
    if (v_line.e->>'variant_id') is not null and btrim(v_line.e->>'variant_id') <> '' then
      begin
        perform (v_line.e->>'variant_id')::uuid;
      exception when others then
        raise exception 'quick_sale_deduct: line % has an invalid variant_id "%"',
          v_line.ord, v_line.e->>'variant_id';
      end;
    end if;

    -- quantity: present
    if (v_line.e->>'quantity') is null then
      raise exception 'quick_sale_deduct: line % is missing quantity', v_line.ord;
    end if;
    -- quantity: numeric
    begin
      v_q := (v_line.e->>'quantity')::numeric;
    exception when others then
      raise exception 'quick_sale_deduct: line % has a non-numeric quantity "%"',
        v_line.ord, v_line.e->>'quantity';
    end;
    -- quantity: > 0  (every individual line)
    if v_q <= 0 then
      raise exception 'quick_sale_deduct: line % has quantity % — must be greater than 0',
        v_line.ord, v_q;
    end if;
  end loop;

  -- ── PASS 1 — group by (product_id, variant_id), SUM qty, lock + validate ──
  for v_grp in
    select
      (e->>'product_id')::uuid                        as product_id,
      nullif(e->>'variant_id','')::uuid               as variant_id,
      max(e->>'product_name')                         as product_name,
      sum((e->>'quantity')::numeric)                  as total_qty
    from jsonb_array_elements(p_items) as e
    group by 1, 2                                      -- NULL variant groups together
  loop
    -- EXACT match: variant equal-or-both-null. Unique index guarantees one row.
    select * into v_inv
    from public.inventory_stocks
    where warehouse_id = p_warehouse_id
      and product_id   = v_grp.product_id
      and variant_id is not distinct from v_grp.variant_id
    for update;                                        -- ROW LOCK

    if not found then
      raise exception 'No inventory record for product % in this warehouse',
        coalesce(v_grp.product_name, v_grp.product_id::text);
    end if;

    -- physical stock must cover the TOTAL requested (no greatest(0,...) clamp)
    if v_inv.quantity < v_grp.total_qty then
      raise exception 'Insufficient stock for %: have %, need %',
        coalesce(v_grp.product_name, v_grp.product_id::text), v_inv.quantity, v_grp.total_qty
        using errcode = 'P0001';
    end if;
  end loop;

  -- ── PASS 2 — re-group identically, deduct EXACTLY ONE row + log per item ──
  for v_grp in
    select
      (e->>'product_id')::uuid                        as product_id,
      nullif(e->>'variant_id','')::uuid               as variant_id,
      max(e->>'product_name')                         as product_name,
      max(e->>'unit_cost')                            as unit_cost,
      sum((e->>'quantity')::numeric)                  as total_qty
    from jsonb_array_elements(p_items) as e
    group by 1, 2
  loop
    update public.inventory_stocks
    set quantity        = quantity - v_grp.total_qty,                 -- relative, in SQL
        total_value_etb = (quantity - v_grp.total_qty) * avg_cost_etb,-- uses OLD quantity (Postgres)
        updated_at      = now()
        -- reserved_quantity is intentionally NOT touched (quick sales never reserve)
    where warehouse_id = p_warehouse_id
      and product_id   = v_grp.product_id
      and variant_id is not distinct from v_grp.variant_id;          -- exactly one row

    -- exactly ONE transaction row per grouped item, using the loaded warehouse
    -- name. A plain INSERT VALUES (not INSERT..SELECT) guarantees the row is
    -- always written alongside the deduction above.
    insert into public.stock_transactions
      (product_id, variant_id, product_name, warehouse_id, warehouse_name,
       type, reason, quantity, unit_cost_etb, reference_id, reference_type, created_by)
    values
      (v_grp.product_id, v_grp.variant_id, v_grp.product_name, p_warehouse_id, v_wh_name,
       'stock_out', 'sale', v_grp.total_qty, nullif(v_grp.unit_cost,'')::numeric,
       p_sale_id::text, 'Sale', v_actor);

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lines', v_n);
end;
$$;

grant execute on function public.quick_sale_deduct(uuid, uuid, jsonb) to authenticated, service_role;

-- ============================================================================
-- End Phase 4. Frontend NOT wired yet. Quick-sale deduction only — does not
-- create the sale row (still done in the browser before this RPC is called).
-- ============================================================================
