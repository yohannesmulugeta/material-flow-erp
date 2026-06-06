-- ============================================================================
-- Phase 3A — Atomic standard-sale reservation (reservation ONLY)
--
--   reserve_stock(p_warehouse_id, p_items) locks inventory rows, validates
--   availability (quantity - reserved_quantity), and increments
--   reserved_quantity in a SINGLE transaction.
--
-- Does NOT touch: sales, warehouse_releases, quantity, stock_transactions.
-- Quick sales + warehouse approval are NOT affected. No schema change.
--
-- v3 (revised):
--   * PASS 0 validates EACH RAW item line (product_id valid uuid, quantity
--     present/numeric/>0, variant_id valid uuid if present) BEFORE grouping —
--     so a negative line can never be hidden by a positive one in the same group.
--   * PASS 1 groups by (product_id, variant_id), SUMS quantity, locks + validates
--     the TOTAL against availability.
--   * Exact variant match via `variant_id is not distinct from ...` (a null
--     item-variant matches only the null-variant row; unique index → one row).
-- ============================================================================

create or replace function public.reserve_stock(
  p_warehouse_id uuid,
  p_items        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line  record;
  v_q     numeric;
  v_grp   record;
  v_inv   public.inventory_stocks%rowtype;
  v_avail numeric;
  v_n     int := 0;
begin
  -- 0. Argument guards
  if p_warehouse_id is null then
    raise exception 'reserve_stock: warehouse_id is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'reserve_stock: items must be a JSON array';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'reserve_stock: no items to reserve';
  end if;

  -- ── PASS 0 — validate every RAW line before any grouping ──────────────────
  for v_line in
    select e, ord from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  loop
    -- product_id: present + valid uuid
    if (v_line.e->>'product_id') is null or btrim(v_line.e->>'product_id') = '' then
      raise exception 'reserve_stock: line % is missing product_id', v_line.ord;
    end if;
    begin
      perform (v_line.e->>'product_id')::uuid;
    exception when others then
      raise exception 'reserve_stock: line % has an invalid product_id "%"',
        v_line.ord, v_line.e->>'product_id';
    end;

    -- variant_id: optional, but if present must be a valid uuid
    if (v_line.e->>'variant_id') is not null and btrim(v_line.e->>'variant_id') <> '' then
      begin
        perform (v_line.e->>'variant_id')::uuid;
      exception when others then
        raise exception 'reserve_stock: line % has an invalid variant_id "%"',
          v_line.ord, v_line.e->>'variant_id';
      end;
    end if;

    -- quantity: present
    if (v_line.e->>'quantity') is null then
      raise exception 'reserve_stock: line % is missing quantity', v_line.ord;
    end if;
    -- quantity: numeric
    begin
      v_q := (v_line.e->>'quantity')::numeric;
    exception when others then
      raise exception 'reserve_stock: line % has a non-numeric quantity "%"',
        v_line.ord, v_line.e->>'quantity';
    end;
    -- quantity: > 0  (every individual line, not just the group total)
    if v_q <= 0 then
      raise exception 'reserve_stock: line % has quantity % — must be greater than 0',
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

    -- validate TOTAL requested against availability
    v_avail := v_inv.quantity - v_inv.reserved_quantity;
    if v_grp.total_qty > v_avail then
      raise exception 'Only % available of % (total requested %)',
        v_avail, coalesce(v_grp.product_name, v_grp.product_id::text), v_grp.total_qty
        using errcode = 'P0001';
    end if;
  end loop;

  -- ── PASS 2 — re-group identically, update EXACTLY ONE row per item ────────
  for v_grp in
    select
      (e->>'product_id')::uuid                        as product_id,
      nullif(e->>'variant_id','')::uuid               as variant_id,
      sum((e->>'quantity')::numeric)                  as total_qty
    from jsonb_array_elements(p_items) as e
    group by 1, 2
  loop
    update public.inventory_stocks
    set reserved_quantity = reserved_quantity + v_grp.total_qty,   -- relative, computed in SQL
        updated_at        = now()
    where warehouse_id = p_warehouse_id
      and product_id   = v_grp.product_id
      and variant_id is not distinct from v_grp.variant_id;        -- exactly one row

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lines', v_n);
end;
$$;

grant execute on function public.reserve_stock(uuid, jsonb) to authenticated, service_role;

-- ============================================================================
-- End Phase 3A. Frontend NOT wired yet. Reservation only — releasing/deducting
-- is handled by release_and_deduct (already live).
-- ============================================================================
