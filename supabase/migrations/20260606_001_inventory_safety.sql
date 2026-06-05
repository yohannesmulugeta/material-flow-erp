-- ============================================================================
-- Inventory Safety — Phase 1 (DB foundation only; no frontend changes)
--
--   1. CHECK constraints so stock can never go negative or over-reserved.
--   2. Atomic release_and_deduct() RPC that locks rows and deducts safely.
--
-- Live diagnostic (run 2026-06-06 against project qpxdhnabiledsjcnbvnv):
--   24 inventory_stocks rows, 0 violations. Constraints apply cleanly.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. DIAGNOSTIC — run this FIRST to confirm no row violates the new rules.
--    Adding a CHECK constraint fails loudly if any existing row violates it,
--    so this is your safety preview. It must return ZERO rows.
-- ─────────────────────────────────────────────────────────────────────────────
-- select id, product_name, warehouse_name, quantity, reserved_quantity,
--        case
--          when quantity < 0                  then 'quantity<0'
--          when reserved_quantity < 0         then 'reserved<0'
--          when reserved_quantity > quantity  then 'reserved>quantity'
--        end as violation
-- from public.inventory_stocks
-- where quantity < 0
--    or reserved_quantity < 0
--    or reserved_quantity > quantity;
--
-- If the query above returns rows, STOP. Do not run the constraint section.
-- Investigate each row manually first (do NOT silently clamp data).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CHECK CONSTRAINTS
--    Added as NOT VALID first (instant, no table scan, no lock on existing
--    rows), then VALIDATEd separately. If VALIDATE fails, existing bad data
--    exists and the constraint stays NOT VALID (enforced for NEW writes only)
--    until you clean the data — it never silently changes your rows.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_stocks_quantity_nonneg') then
    alter table public.inventory_stocks
      add constraint inventory_stocks_quantity_nonneg check (quantity >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_stocks_reserved_nonneg') then
    alter table public.inventory_stocks
      add constraint inventory_stocks_reserved_nonneg check (reserved_quantity >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_stocks_reserved_le_qty') then
    alter table public.inventory_stocks
      add constraint inventory_stocks_reserved_le_qty check (reserved_quantity <= quantity) not valid;
  end if;
end $$;

-- Validate against existing rows. Safe because the live diagnostic showed 0
-- violations. If any of these throw, the offending rows must be fixed by hand.
alter table public.inventory_stocks validate constraint inventory_stocks_quantity_nonneg;
alter table public.inventory_stocks validate constraint inventory_stocks_reserved_nonneg;
alter table public.inventory_stocks validate constraint inventory_stocks_reserved_le_qty;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ATOMIC RPC — release_and_deduct(p_release_id)
--    Deducts stock for a STANDARD warehouse release (stock was reserved at sale
--    time) in a SINGLE transaction with row locks. Safe replacement for the
--    browser read-modify-write in WarehouseReleases.approve. (Frontend NOT wired
--    yet — Phase 2.)
--
--    SCOPE: standard releases ONLY. Quick/counter sales do NOT reserve stock and
--    therefore must NOT use this function — they need a separate
--    quick_sale_deduct() (later phase) that deducts quantity without touching
--    reserved_quantity. Passing a quick sale here would correctly FAIL on the
--    reservation check (reserved_quantity would be 0).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.release_and_deduct(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release  public.warehouse_releases%rowtype;
  v_items    jsonb;
  v_item     jsonb;
  v_pid      uuid;
  v_vid      uuid;
  v_qty      numeric;
  v_inv      public.inventory_stocks%rowtype;
  v_actor    uuid := auth.uid();
  v_actor_nm text;
begin
  -- 2.1 Load + lock the release row
  select * into v_release
  from public.warehouse_releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'Warehouse release % not found', p_release_id
      using errcode = 'P0002';
  end if;

  -- 2.2 Idempotency / state guards — never deduct twice
  if v_release.status = 'approved' then
    raise exception 'Release % is already approved; stock was already deducted', p_release_id
      using errcode = 'P0001';
  end if;
  if v_release.status = 'rejected' then
    raise exception 'Release % was rejected and cannot be approved', p_release_id
      using errcode = 'P0001';
  end if;

  -- 2.3 Parse items JSON safely (never abort the whole tx on bad JSON without a clear message)
  begin
    v_items := coalesce(nullif(v_release.items, '')::jsonb, '[]'::jsonb);
  exception when others then
    raise exception 'Release % has invalid items JSON and cannot be processed', p_release_id;
  end;
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'Release % items is not a JSON array', p_release_id;
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'Release % has no line items', p_release_id;
  end if;

  -- 2.4 PASS 1 — lock every affected inventory row and validate sufficiency
  --     BEFORE changing anything. If any line fails, the whole tx rolls back
  --     and nothing was deducted (no half-updates).
  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_pid := nullif(v_item->>'product_id','')::uuid;
    v_vid := nullif(v_item->>'variant_id','')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);

    if v_pid is null or v_qty <= 0 then
      raise exception 'Release % has an invalid line item (product_id=%, qty=%)',
        p_release_id, v_item->>'product_id', v_item->>'quantity';
    end if;

    select * into v_inv
    from public.inventory_stocks
    where product_id = v_pid
      and warehouse_id = v_release.warehouse_id
      and (v_vid is null or variant_id = v_vid)
    for update;                                   -- ROW LOCK: serializes concurrent deductions

    if not found then
      raise exception 'No inventory record for product % in warehouse %',
        coalesce(v_item->>'product_name', v_pid::text), v_release.warehouse_name;
    end if;

    -- (a) physical stock must cover the line
    if v_inv.quantity < v_qty then
      raise exception 'Insufficient stock for %: have %, need %',
        coalesce(v_item->>'product_name', v_pid::text), v_inv.quantity, v_qty;
    end if;

    -- (b) the stock must ALREADY be reserved for this release. A standard
    --     warehouse release reserves stock at sale time, so reserved_quantity
    --     must be >= the line qty. If it is not, the reservation is wrong/missing
    --     and we must FAIL LOUDLY rather than silently clamp it.
    if v_inv.reserved_quantity < v_qty then
      raise exception
        'Reservation mismatch for %: reserved %, need %. Stock was not properly reserved for this release — investigate before approving.',
        coalesce(v_item->>'product_name', v_pid::text), v_inv.reserved_quantity, v_qty
        using errcode = 'P0001';
    end if;
  end loop;

  -- 2.5 PASS 2 — apply deductions (all lines validated, all rows locked)
  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_pid := nullif(v_item->>'product_id','')::uuid;
    v_vid := nullif(v_item->>'variant_id','')::uuid;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);

    -- reserved_quantity is subtracted directly (NOT greatest(0,...)). Pass 1
    -- already proved reserved_quantity >= v_qty under the row lock, so this can
    -- never go negative; if it somehow tried to, the CHECK constraint blocks it.
    update public.inventory_stocks
    set quantity          = quantity - v_qty,                  -- relative, computed in SQL
        reserved_quantity = reserved_quantity - v_qty,         -- consume the existing reservation
        total_value_etb   = (quantity - v_qty) * avg_cost_etb, -- uses OLD quantity (Postgres semantics)
        updated_at        = now()
    where product_id = v_pid
      and warehouse_id = v_release.warehouse_id
      and (v_vid is null or variant_id = v_vid);

    insert into public.stock_transactions
      (product_id, variant_id, product_name, warehouse_id, warehouse_name,
       type, reason, quantity, unit_cost_etb, reference_id, reference_type, created_by)
    values
      (v_pid, v_vid, v_item->>'product_name', v_release.warehouse_id, v_release.warehouse_name,
       'stock_out', 'sale', v_qty, nullif(v_item->>'unit_cost','')::numeric,
       v_release.sale_id::text, 'Sale', v_actor);
  end loop;

  -- 2.6 Flip release + sale to completed
  select full_name into v_actor_nm from public.profiles where id = v_actor;

  update public.warehouse_releases
  set status      = 'approved',
      pick_status = 'released',
      approved_by = coalesce(v_actor_nm, 'system'),
      approved_at = now(),
      updated_at  = now()
  where id = p_release_id;

  update public.sales
  set workflow_status = 'completed',
      status          = 'completed',
      completed_at    = now(),
      updated_at      = now()
  where id = v_release.sale_id;

  return jsonb_build_object(
    'ok', true,
    'release_id', p_release_id,
    'sale_id', v_release.sale_id,
    'lines', jsonb_array_length(v_items)
  );
end;
$$;

grant execute on function public.release_and_deduct(uuid) to authenticated, service_role;

-- ============================================================================
-- End Phase 1. Frontend is NOT wired to this RPC yet — that is Phase 2.
-- Until then, the existing browser-side deduction still runs; these constraints
-- act as a backstop that prevents it from ever producing negative/oversold stock.
-- ============================================================================
