-- ============================================================================
-- Non-sales path #3 — Atomic warehouse-to-warehouse transfer approval
--
--   approve_transfer(p_transfer_id) MOVES stock from a source warehouse to a
--   destination warehouse: deducts source quantity, adds (or creates) the
--   destination row, writes a stock_out + stock_in pair, and marks the transfer
--   'completed' — ALL in ONE transaction with row locks and a state guard.
--
--   This is stricter than returns/damages because it touches TWO inventory rows.
--   The whole point: no partial state. Source is NEVER deducted unless the
--   destination add AND the status update also succeed (single transaction, full
--   rollback on any failure).
--
--   Stricter than the old browser code in one deliberate way: it blocks moving
--   stock that is RESERVED for a pending sale
--       (quantity - reserved_quantity >= transfer quantity).
--   reserved_quantity is never touched on either side.
--
--   Cost handling (intentionally conservative — no weighted-average changes here):
--     * unit cost of the move = SOURCE avg_cost_etb.
--     * destination existing row: quantity += n, total recomputed at the
--       destination's OWN existing avg_cost_etb; avg_cost_etb left unchanged.
--     * destination new row: created carrying the SOURCE avg_cost_etb.
--
--   Transfers have no variant_id, so inventory is matched on null-variant rows.
--
-- Does NOT change any sales-path RPC, approve_return, or approve_damage.
-- No schema change.
-- ============================================================================

create or replace function public.approve_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tr        public.transfers%rowtype;
  v_src       public.inventory_stocks%rowtype;
  v_dst       public.inventory_stocks%rowtype;
  v_dst_found boolean := false;
  v_src_wh    text;
  v_dst_wh    text;
  v_actor     uuid := auth.uid();
  v_actor_nm  text;
  v_rows      int := 0;
begin
  -- 0. Argument guard
  if p_transfer_id is null then
    raise exception 'approve_transfer: transfer_id is required';
  end if;

  -- 1. Load + lock the transfer row
  select * into v_tr from public.transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'approve_transfer: transfer % not found', p_transfer_id
      using errcode = 'P0002';
  end if;

  -- 2. State guard (idempotency + safety): approve ONLY from 'pending'.
  --    A strict whitelist also blocks unknown/legacy statuses from being
  --    approved accidentally (covers the old completed/rejected cases too).
  if v_tr.status is distinct from 'pending' then
    raise exception 'Transfer must be pending to approve. Current status: %', v_tr.status
      using errcode = 'P0001';
  end if;

  -- 3. Required-field validation
  if v_tr.product_id is null then
    raise exception 'approve_transfer: transfer % has no product_id', p_transfer_id;
  end if;
  if v_tr.source_warehouse_id is null then
    raise exception 'approve_transfer: transfer % has no source_warehouse_id', p_transfer_id;
  end if;
  if v_tr.destination_warehouse_id is null then
    raise exception 'approve_transfer: transfer % has no destination_warehouse_id', p_transfer_id;
  end if;
  if v_tr.source_warehouse_id = v_tr.destination_warehouse_id then
    raise exception 'approve_transfer: source and destination warehouse are the same';
  end if;
  if coalesce(v_tr.quantity, 0) <= 0 then
    raise exception 'approve_transfer: transfer % has quantity % — must be greater than 0',
      p_transfer_id, v_tr.quantity;
  end if;

  -- 4. Both warehouses must exist (load names for tx rows / new dest row)
  select name into v_src_wh from public.warehouses where id = v_tr.source_warehouse_id;
  if not found then
    raise exception 'approve_transfer: source warehouse % does not exist',
      v_tr.source_warehouse_id using errcode = 'P0002';
  end if;
  select name into v_dst_wh from public.warehouses where id = v_tr.destination_warehouse_id;
  if not found then
    raise exception 'approve_transfer: destination warehouse % does not exist',
      v_tr.destination_warehouse_id using errcode = 'P0002';
  end if;

  -- 4b. DEADLOCK PREVENTION: take a transaction-level advisory lock keyed by
  --     (product_id, sorted warehouse pair) BEFORE locking any inventory rows.
  --     Sorting source/destination with least()/greatest() means a forward
  --     transfer (A->B) and its reverse (B->A) for the same product hash to the
  --     SAME key, so they serialize on the advisory lock instead of grabbing the
  --     two inventory rows in opposite orders and deadlocking. Released
  --     automatically at commit/rollback (xact-scoped).
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_tr.product_id::text || ':' ||
      least(v_tr.source_warehouse_id, v_tr.destination_warehouse_id)::text || ':' ||
      greatest(v_tr.source_warehouse_id, v_tr.destination_warehouse_id)::text,
      0)
  );

  -- 5. Lock SOURCE inventory row (product + source warehouse, null variant).
  --    Safe under concurrency thanks to the advisory lock above; both rows are
  --    then taken source-then-destination within the serialized critical section.
  select * into v_src
  from public.inventory_stocks
  where product_id = v_tr.product_id
    and warehouse_id = v_tr.source_warehouse_id
    and variant_id is null
  for update;

  -- 6. Missing source inventory → HARD ERROR (cannot move stock that isn't there)
  if not found then
    raise exception 'approve_transfer: no inventory for product % in source warehouse % — cannot transfer stock that does not exist',
      coalesce(v_tr.product_name, v_tr.product_id::text), coalesce(v_src_wh, v_tr.source_warehouse_id::text)
      using errcode = 'P0001';
  end if;

  -- 7. Physical sufficiency (no clamp).
  if v_src.quantity < v_tr.quantity then
    raise exception 'Not enough stock to transfer %: on hand %, requested %.',
      coalesce(v_tr.product_name, v_tr.product_id::text), v_src.quantity, v_tr.quantity
      using errcode = 'P0001';
  end if;

  -- 8. Reserved-stock protection: do not move stock reserved for a pending sale.
  if (v_src.quantity - v_src.reserved_quantity) < v_tr.quantity then
    raise exception
      'Not enough AVAILABLE stock to transfer %: on hand %, reserved %, available %, requested %. Reserved stock belongs to a pending sale.',
      coalesce(v_tr.product_name, v_tr.product_id::text),
      v_src.quantity, v_src.reserved_quantity,
      (v_src.quantity - v_src.reserved_quantity), v_tr.quantity
      using errcode = 'P0001';
  end if;

  -- 9. Lock DESTINATION inventory row (product + dest warehouse, null variant).
  select * into v_dst
  from public.inventory_stocks
  where product_id = v_tr.product_id
    and warehouse_id = v_tr.destination_warehouse_id
    and variant_id is null
  for update;
  v_dst_found := found;

  -- 10. Apply to DESTINATION (relative, in SQL).
  if v_dst_found then
    -- existing row: add qty, recompute value at the DESTINATION's own avg cost.
    -- avg_cost_etb intentionally left unchanged (no weighted-average in this phase).
    update public.inventory_stocks
    set quantity        = quantity + v_tr.quantity,
        total_value_etb = (quantity + v_tr.quantity) * avg_cost_etb,
        updated_at      = now()
    where id = v_dst.id;
  else
    -- new row: carry the SOURCE avg cost (cost follows the goods).
    insert into public.inventory_stocks
      (product_id, product_name, warehouse_id, warehouse_name,
       quantity, reserved_quantity, avg_cost_etb, total_value_etb, created_by)
    values
      (v_tr.product_id, v_tr.product_name, v_tr.destination_warehouse_id, v_dst_wh,
       v_tr.quantity, 0, coalesce(v_src.avg_cost_etb, 0),
       v_tr.quantity * coalesce(v_src.avg_cost_etb, 0), v_actor);
  end if;

  -- 11. Apply to SOURCE (relative, in SQL; no clamp; reserved untouched).
  update public.inventory_stocks
  set quantity        = quantity - v_tr.quantity,
      total_value_etb = (quantity - v_tr.quantity) * avg_cost_etb,
      updated_at      = now()
  where id = v_src.id;

  -- 12. Two stock_transactions: out from source, in to destination.
  --     unit_cost_etb = SOURCE avg cost for both legs.
  insert into public.stock_transactions
    (product_id, product_name, warehouse_id, warehouse_name,
     type, reason, quantity, unit_cost_etb, reference_id, reference_type, created_by)
  values
    (v_tr.product_id, v_tr.product_name, v_tr.source_warehouse_id, v_src_wh,
     'stock_out', 'transfer_out', v_tr.quantity, v_src.avg_cost_etb,
     p_transfer_id::text, 'Transfer', v_actor),
    (v_tr.product_id, v_tr.product_name, v_tr.destination_warehouse_id, v_dst_wh,
     'stock_in', 'transfer_in', v_tr.quantity, v_src.avg_cost_etb,
     p_transfer_id::text, 'Transfer', v_actor);

  -- 13. Mark the transfer completed (assert exactly one row updated)
  select full_name into v_actor_nm from public.profiles where id = v_actor;
  update public.transfers
  set status      = 'completed',
      approved_by = coalesce(v_actor_nm, 'system'),
      updated_at  = now()
  where id = p_transfer_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'approve_transfer: expected to complete 1 transfer row but updated %', v_rows
      using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.approve_transfer(uuid) to authenticated, service_role;

-- ============================================================================
-- End. Frontend NOT wired yet. Moves stock atomically across two warehouses with
-- no partial-state risk, blocks transfers of insufficient/reserved stock, and is
-- idempotent. Reject path (status-only) is unchanged and needs no RPC.
-- ============================================================================
