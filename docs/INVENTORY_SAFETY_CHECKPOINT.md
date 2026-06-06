# Inventory Safety — Technical Checkpoint

**Date:** 2026-06-06
**Project:** Material Flow ERP
**Supabase project ref:** `qpxdhnabiledsjcnbvnv` (single project — local dev and production share it)
**Status:** Phase 1 + Phase 2 complete, pushed, and verified in production.

---

## 1. What was fixed

The warehouse-release stock deduction used to run **entirely in the browser** as a
read-modify-write against possibly-stale React Query cache:

```js
const newQty = Math.max(0, inv.quantity - item.quantity);
const newReserved = Math.max(0, inv.reserved_quantity - item.quantity);
await InventoryStock.update(inv.id, { quantity: newQty, reserved_quantity: newReserved });
```

Problems with that approach:
- **Lost-update race / overselling** — two concurrent approvals could both write
  `start − qty`, double-counting available stock.
- **No transaction** — a mid-loop failure left the DB half-updated.
- **`Math.max(0, …)` masked bugs** — a release whose stock was never properly
  reserved would still "succeed" and deduct anyway.

### The fix
1. **DB CHECK constraints** make negative / over-reserved stock physically impossible.
2. **Atomic `release_and_deduct(p_release_id)` RPC** does the deduction in a single
   transaction with `SELECT … FOR UPDATE` row locks, validates **both** physical
   stock and the existing reservation, and fails loudly (full rollback) if the
   reservation is wrong.
3. **Frontend wired** so `WarehouseReleases.approve` calls the RPC instead of doing
   stock math in the browser.

Scope: **standard warehouse-release approval only.** Quick/counter sales and the
reserve-at-sale path were intentionally not changed in these phases.

---

## 2. Commits pushed

All on `main`, pushed to `origin` (range `55cfac2..0d8d3a8`):

| Hash | Message |
|---|---|
| `0d8d3a8` | feat(warehouse): approve releases through inventory RPC |
| `154497a` | feat(db): add inventory safety constraints and release RPC |
| `94e4a94` | fix(ui): show mutation error toasts |
| `0c667da` | fix(security): deny access for unknown roles |

(The two leading commits — `154497a`, `0d8d3a8` — are the core of this checkpoint;
the other two are the related safety/UX fixes pushed in the same batch.)

---

## 3. Database migration applied

**File:** `supabase/migrations/20260606_001_inventory_safety.sql`
**Applied to:** project `qpxdhnabiledsjcnbvnv` via `supabase db push`.

It added:

- **3 CHECK constraints on `inventory_stocks`** (added `NOT VALID` then `VALIDATE`d
  against existing data — 0 violations at apply time):
  - `inventory_stocks_quantity_nonneg`  → `quantity >= 0`
  - `inventory_stocks_reserved_nonneg`  → `reserved_quantity >= 0`
  - `inventory_stocks_reserved_le_qty`  → `reserved_quantity <= quantity`
- **Function `public.release_and_deduct(p_release_id uuid) returns jsonb`**
  (SECURITY DEFINER). In one transaction it:
  loads + locks the release → guards against already-approved/rejected →
  parses items JSON safely → **Pass 1** locks each inventory row and validates
  `quantity >= line_qty` **and** `reserved_quantity >= line_qty` →
  **Pass 2** sets `quantity = quantity - qty`, `reserved_quantity = reserved_quantity - qty`,
  inserts `stock_transactions`, marks the release `approved` and the sale `completed`.

Post-apply verification (live): all 3 constraints present, function present
(`p_release_id uuid` → `jsonb`), diagnostic returned **0** violating rows.

---

## 4. Manual tests that passed

Tested by running the app locally (dev server on :5174; :5173 was occupied by an
unrelated project) against the live database, then cleaning up all test data and
restoring the row to exact baseline (Q0=3500, R0=0).

**Test A — happy path (real UI "Approve & Deduct Stock" click), N=1 cash sale:**

| Check | Result |
|---|---|
| `quantity` 3500 → 3499 | ✅ |
| `reserved_quantity` 1 → 0 | ✅ |
| `total_value_etb` recomputed (3499 × 408) | ✅ |
| one `stock_out` / `sale` `stock_transactions` row | ✅ |
| release → `pick_status=released`, `status=approved`, approver set | ✅ |
| sale → `status=completed`, `workflow_status=completed`, `completed_at` set | ✅ |
| UI: no error toast, item moved Awaiting → Completed | ✅ |

**Test B — failure path (reservation missing: reserved 0, need 1):**

| Check | Result |
|---|---|
| RPC raises "Reservation mismatch … investigate before approving" | ✅ |
| `quantity` unchanged (full rollback) | ✅ |
| `reserved_quantity` unchanged | ✅ |
| release stays `pending` (not approved) | ✅ |

**Cleanup:** all test sales / releases / stock_transactions / activity_logs deleted,
inventory row restored to exact baseline, integrity check returned **0** violations,
**0** leftover test rows.

---

## 5. What is NOT fixed yet

These still use the old browser-side read-modify-write pattern (no RPC, no locks):

- **Reserve-at-sale-time** in `NewSaleForm.saveSale` (`reserved_quantity += qty`).
- **Quick / counter sale** deduction path in `NewSaleForm` (deducts `quantity`
  immediately without reservation).
- **Release reject** in `WarehouseReleases.reject` (returns reservation in the browser).
- **Approvals page** flows (transfers, returns, damages, stock adjustments) that
  adjust inventory in the browser.
- **Container receiving** (`ContainerDetail`) that adds stock in the browser.

The CHECK constraints DO protect all of the above from producing negative /
over-reserved stock — but those paths are still not atomic and can still race.

---

## 6. Risks remaining

1. **Non-RPC paths can still race.** Reserve, quick sale, reject, transfers,
   returns, damages, receiving are still browser-computed. Concurrent operations on
   the same row can lose updates. The constraints prevent *corruption* (negative /
   over-reserved) but a lost update can still under/over-count quantity within valid
   bounds.
2. **Constraint can surface as a user error in the reserve path.** Because
   `reserved_quantity <= quantity` is now enforced, a stale-cache double-reserve in
   `NewSaleForm` that previously slipped through will now throw — surfaced via the
   error toast. This is the safety working, but it is a behavior change to watch.
3. **Single shared database.** Local dev and production point at the same Supabase
   project, so any local testing affects live data. No isolated dev/staging DB exists.
4. **Variant matching assumption.** The RPC matches inventory by `product_id` +
   `warehouse_id` (and `variant_id` only if the item JSON carries it). Current sale
   items do not include `variant_id`; if sales become variant-specific, the items
   JSON must include it for the RPC to target the right row.
5. **Direct table UPDATE on `inventory_stocks` is still granted.** Stock can still be
   changed outside the RPC (by the remaining browser paths or a crafted client). The
   RPC is not yet the *only* way to change stock.

---

## 7. Next recommended phases

In priority order:

1. **Phase 3 — `reserve_stock(p_warehouse, p_items)` RPC** and wire
   `NewSaleForm.saveSale` (standard path) to it. Atomic check-and-reserve removes
   the highest-frequency remaining race (overselling at sale time).
2. **Phase 4 — `quick_sale_deduct(...)` RPC** for the counter-sale path (deduct
   `quantity` only, no reservation) and wire the quick-complete branch.
3. **Phase 5 — `cancel_reservation(p_release_id)` RPC** and wire
   `WarehouseReleases.reject`.
4. **Phase 6 — migrate Approvals (transfers / returns / damages / adjustments) and
   Container receiving** to atomic RPCs.
5. **Phase 7 — lock it down:** once all stock writes go through RPCs, `REVOKE`
   direct `UPDATE` on `inventory_stocks.quantity` / `reserved_quantity` from
   `authenticated`, so stock can *only* change through vetted functions.
6. **Optional — separate Supabase dev project** so future testing never touches
   live data.

---

*Checkpoint generated 2026-06-06. No app code or database was changed to produce
this document.*
