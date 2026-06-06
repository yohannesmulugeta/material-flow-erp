-- ============================================================================
-- Phase 5 — Atomic warehouse-release rejection
--
--   reject_release(p_release_id) returns the reserved stock, marks the release
--   'rejected', and cancels the sale — all in ONE transaction with row locks.
--
--   Frees reserved_quantity ONLY. Never touches quantity and never inserts
--   stock_transactions (a pending release was reserved, not deducted).
--
-- Symmetric counterpart to release_and_deduct. Does NOT change reserve_stock,
-- release_and_deduct, or quick_sale_deduct. No schema change.
--
-- Validation/locking mirrors the other RPCs: state guards, PASS 0 raw-line
-- validation, grouped (product_id, variant_id) sums, exact variant match via
-- `variant_id is not distinct from ...`, and NO greatest(0,...) clamp.
-- ============================================================================

create or replace function public.reject_release(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.warehouse_releases%rowtype;
  v_items   jsonb;
  v_line    record;
  v_q       numeric;
  v_grp     record;
  v_inv     public.inventory_stocks%rowtype;
  v_n       int := 0;
  v_rows    int := 0;
begin
  -- 0. Argument guard
  if p_release_id is null then
    raise exception 'reject_release: release_id is required';
  end if;

  -- 1. Load + lock the release row
  select * into v_release
  from public.warehouse_releases
  where id = p_release_id
  for update;

  -- 2. Existence + state guards (idempotency; prevents double-reject / rejecting
  --    an already-approved release which would wrongly subtract reservation).
  if not found then
    raise exception 'reject_release: release % not found', p_release_id
      using errcode = 'P0002';
  end if;
  if v_release.status = 'approved' then
    raise exception 'Release is already approved; stock was already deducted and cannot be rejected.'
      using errcode = 'P0001';
  end if;
  if v_release.status = 'rejected' then
    raise exception 'Release is already rejected.'
      using errcode = 'P0001';
  end if;

  -- 2b. The release must point at a real sale. Validate + LOCK the sale row up
  --     front so the later cancel UPDATE is guaranteed to hit exactly that row
  --     (a null/missing sale_id would otherwise update 0 rows silently).
  if v_release.sale_id is null then
    raise exception 'reject_release: release % has no sale_id', p_release_id
      using errcode = 'P0001';
  end if;
  perform 1 from public.sales where id = v_release.sale_id for update;
  if not found then
    raise exception 'reject_release: sale % for release % does not exist',
      v_release.sale_id, p_release_id
      using errcode = 'P0002';
  end if;

  -- 3. Parse items JSON safely
  begin
    v_items := coalesce(nullif(v_release.items, '')::jsonb, '[]'::jsonb);
  exception when others then
    raise exception 'reject_release: release % has invalid items JSON', p_release_id;
  end;
  -- 4. Must be a non-empty array
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'reject_release: release % items is not a JSON array', p_release_id;
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'reject_release: release % has no line items', p_release_id;
  end if;

  -- 9. PASS 0 — validate every RAW item before grouping
  for v_line in
    select e, ord from jsonb_array_elements(v_items) with ordinality as t(e, ord)
  loop
    if (v_line.e->>'product_id') is null or btrim(v_line.e->>'product_id') = '' then
      raise exception 'reject_release: line % is missing product_id', v_line.ord;
    end if;
    begin
      perform (v_line.e->>'product_id')::uuid;
    exception when others then
      raise exception 'reject_release: line % has an invalid product_id "%"',
        v_line.ord, v_line.e->>'product_id';
    end;

    if (v_line.e->>'variant_id') is not null and btrim(v_line.e->>'variant_id') <> '' then
      begin
        perform (v_line.e->>'variant_id')::uuid;
      exception when others then
        raise exception 'reject_release: line % has an invalid variant_id "%"',
          v_line.ord, v_line.e->>'variant_id';
      end;
    end if;

    if (v_line.e->>'quantity') is null then
      raise exception 'reject_release: line % is missing quantity', v_line.ord;
    end if;
    begin
      v_q := (v_line.e->>'quantity')::numeric;
    exception when others then
      raise exception 'reject_release: line % has a non-numeric quantity "%"',
        v_line.ord, v_line.e->>'quantity';
    end;
    if v_q <= 0 then
      raise exception 'reject_release: line % has quantity % — must be greater than 0',
        v_line.ord, v_q;
    end if;
  end loop;

  -- 10 + 11. PASS 1 — group by (product_id, variant_id), SUM qty, lock + validate
  --          that enough is actually reserved (no greatest(0,...) clamp).
  for v_grp in
    select
      (e->>'product_id')::uuid               as product_id,
      nullif(e->>'variant_id','')::uuid      as variant_id,
      max(e->>'product_name')                as product_name,
      sum((e->>'quantity')::numeric)         as total_qty
    from jsonb_array_elements(v_items) as e
    group by 1, 2
  loop
    select * into v_inv
    from public.inventory_stocks
    where warehouse_id = v_release.warehouse_id
      and product_id   = v_grp.product_id
      and variant_id is not distinct from v_grp.variant_id
    for update;                                        -- ROW LOCK

    if not found then
      raise exception 'No inventory record for product % in this warehouse',
        coalesce(v_grp.product_name, v_grp.product_id::text);
    end if;

    if v_inv.reserved_quantity < v_grp.total_qty then
      raise exception
        'Reservation mismatch for %: reserved %, need to release %. Investigate before rejecting.',
        coalesce(v_grp.product_name, v_grp.product_id::text), v_inv.reserved_quantity, v_grp.total_qty
        using errcode = 'P0001';
    end if;
  end loop;

  -- 12. PASS 2 — free the reservation (reserved_quantity only; quantity untouched;
  --     no stock_transactions).
  for v_grp in
    select
      (e->>'product_id')::uuid               as product_id,
      nullif(e->>'variant_id','')::uuid      as variant_id,
      sum((e->>'quantity')::numeric)         as total_qty
    from jsonb_array_elements(v_items) as e
    group by 1, 2
  loop
    update public.inventory_stocks
    set reserved_quantity = reserved_quantity - v_grp.total_qty,   -- relative, in SQL
        updated_at        = now()
    where warehouse_id = v_release.warehouse_id
      and product_id   = v_grp.product_id
      and variant_id is not distinct from v_grp.variant_id;

    v_n := v_n + 1;
  end loop;

  -- 13. Mark the release rejected
  update public.warehouse_releases
  set status     = 'rejected',
      updated_at = now()
  where id = p_release_id;

  -- 14. Cancel the sale — assert exactly the locked sale row was updated.
  update public.sales
  set status          = 'cancelled',
      workflow_status = 'cancelled',
      updated_at      = now()
  where id = v_release.sale_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'reject_release: expected to cancel 1 sale row but updated % (sale %)',
      v_rows, v_release.sale_id
      using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true, 'lines', v_n);
end;
$$;

grant execute on function public.reject_release(uuid) to authenticated, service_role;

-- ============================================================================
-- End Phase 5. Frontend NOT wired yet. Frees reservation + cancels release/sale
-- in one transaction. Approve path (release_and_deduct) is unchanged.
-- ============================================================================
