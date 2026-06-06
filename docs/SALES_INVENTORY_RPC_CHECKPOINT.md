# Sales Inventory — RPC Safety Checkpoint (Final)

**Date:** 2026-06-10
**Project:** Material Flow ERP
**Supabase project ref:** `qpxdhnabiledsjcnbvnv` (single project — local dev and production share it)
**Status:** All four sales-path stock mutations are now atomic database RPCs. Live, tested, and pushed.

---

## 1. Problem we fixed

Every stock change in the sales workflow used to run **in the browser** as a
read‑modify‑write against possibly‑stale React Query cache:

```js
const newQty = Math.max(0, inv.quantity - item.quantity);
await base44.entities.InventoryStock.update(inv.id, { quantity: newQty, ... });
```

This pattern had four recurring defects:

- **Overselling race** — two concurrent operations read the same value and the
  second write overwrites the first (lost update).
- **`Math.max(0, …)` masking** — a stale/short value was silently clamped to 0
  instead of failing, hiding real shortages and reservation bugs.
- **No transaction** — multi‑item or multi‑step operations could fail halfway,
  leaving the database half‑updated with no rollback.
- **No server‑side validation** — the browser decided availability and sent an
  absolute number; nothing at the DB enforced correctness.

The fix: move each stock mutation into a **`SECURITY DEFINER` Postgres RPC** that
locks rows (`SELECT … FOR UPDATE`), validates server‑side, computes changes
relatively in SQL (`x = x ± n`), and runs all‑or‑nothing in one transaction —
backed by `CHECK` constraints (`quantity >= 0`, `reserved_quantity >= 0`,
`reserved_quantity <= quantity`) as the final guardrail.

---

## 2 & 3. RPCs added and what each handles

| RPC | Handles |
|---|---|
| **`reserve_stock(p_warehouse_id, p_items)`** | Standard sale: validates availability (`quantity − reserved_quantity`) and increments `reserved_quantity`. Never touches `quantity`. |
| **`release_and_deduct(p_release_id)`** | Warehouse approval: validates physical **and** reserved stock, deducts `quantity` and `reserved_quantity`, writes `stock_transactions`, marks the release `approved` and the sale `completed`. |
| **`quick_sale_deduct(p_warehouse_id, p_sale_id, p_items)`** | Counter/quick sale: validates physical stock, deducts `quantity`, recomputes `total_value_etb`, writes `stock_transactions`. Never touches `reserved_quantity`. Validates the warehouse and sale exist first. |
| **`reject_release(p_release_id)`** | Warehouse rejection: validates the reservation, frees `reserved_quantity`, marks the release `rejected` and the sale `cancelled`. Never touches `quantity`; writes no `stock_transactions`. Validates the sale exists and asserts exactly one sale row is cancelled. |

**Shared design across all four:** SECURITY DEFINER · raw‑line validation (PASS 0:
product_id uuid, quantity present/numeric/>0, variant_id uuid if present) ·
items grouped by `(product_id, variant_id)` with quantities summed · exact
variant match via `variant_id is not distinct from …` · two‑pass
validate‑then‑apply · no `greatest(0, …)` · clear, specific error messages ·
`grant execute to authenticated, service_role`.

---

## 4. Frontend files that call each RPC

| RPC | Caller | Mutation |
|---|---|---|
| `reserve_stock` | `src/components/sales/NewSaleForm.jsx` | `saveSale` — standard branch |
| `quick_sale_deduct` | `src/components/sales/NewSaleForm.jsx` | `saveSale` — quick branch |
| `release_and_deduct` | `src/pages/WarehouseReleases.jsx` | `approve` |
| `reject_release` | `src/pages/WarehouseReleases.jsx` | `reject` |

Each call is `const { error } = await supabase.rpc(...); if (error) throw error;`
so failures surface through the existing `onError` toast. `logActivity` is kept
in the frontend (the RPCs do not write `activity_logs`).

---

## 5. Database migrations added

| Migration file | Adds |
|---|---|
| `supabase/migrations/20260606_001_inventory_safety.sql` | 3 CHECK constraints + `release_and_deduct` |
| `supabase/migrations/20260607_001_reserve_stock.sql` | `reserve_stock` |
| `supabase/migrations/20260608_001_drop_old_inventory_unique.sql` | Drops obsolete `inventory_stocks_pw_uidx` (unblocks variant‑level inventory) |
| `supabase/migrations/20260609_001_quick_sale_deduct.sql` | `quick_sale_deduct` |
| `supabase/migrations/20260610_001_reject_release.sql` | `reject_release` |

---

## 6. Commits pushed (on `origin/main`)

| Hash | Message |
|---|---|
| `502afbc` | feat(warehouse): reject releases via reject_release RPC |
| `7f0ae4b` | feat(db): add atomic release rejection RPC |
| `861091e` | feat(sales): deduct quick-sale stock via quick_sale_deduct RPC |
| `e0b1871` | feat(db): add atomic quick sale deduction RPC |
| `1cf4ea9` | feat(sales): reserve standard-sale stock via reserve_stock RPC |
| `3d0e55f` | fix(db): allow variant-level inventory rows |
| `3a2d62f` | feat(db): add atomic stock reservation RPC |
| `0d8d3a8` | feat(warehouse): approve releases through inventory RPC |
| `154497a` | feat(db): add inventory safety constraints and release RPC |

---

## 7. Manual tests that passed

All run against the live database; every test cleaned up and restored the test
row to exact Q0/R0 with a final `0 violations` integrity check.

**SQL test suites (per RPC):**
- `release_and_deduct` — valid, insufficient physical, insufficient reserved,
  already‑approved, multi‑item, partial‑failure rollback.
- `reserve_stock` — valid, duplicate‑line aggregation, oversell (single +
  dup‑sum), negative line, zero qty, missing qty, invalid product_id, invalid
  variant_id, missing inventory row, variant‑safe matching.
- `quick_sale_deduct` — valid, duplicate aggregation, insufficient, negative,
  zero, missing qty, invalid uuid, missing inventory row, missing sale, missing
  warehouse, tx‑created‑on‑success, no‑tx‑on‑failure.
- `reject_release` — valid, already‑approved guard, already‑rejected guard,
  reservation mismatch, missing release, missing sale, bad items JSON.

**End‑to‑end UI tests (real app, N=1):**
- Standard sale → reserve (quantity unchanged, reserved +1) → pick → approve →
  deduct (quantity −1, reserved 0), tx created, release approved, sale completed.
- Quick sale → immediate deduct (quantity −1, reserved untouched), tx created,
  sale completed, **no** warehouse_release; insufficient‑stock case blocked.
- Standard sale → pick → **reject** → reservation freed (quantity unchanged,
  reserved 0), release rejected, sale cancelled, **no** stock_transaction.

---

## 8. Sales paths now safe

| Sales path | Status |
|---|---|
| Standard sale reservation | ✅ DB RPC (`reserve_stock`) |
| Warehouse approve / deduct | ✅ DB RPC (`release_and_deduct`) |
| Quick sale deduct | ✅ DB RPC (`quick_sale_deduct`) |
| Warehouse reject / cancel reservation | ✅ DB RPC (`reject_release`) |

Every sales‑path stock mutation is atomic, row‑locked, validated server‑side, and
all‑or‑nothing. Negative / over‑reserved stock is impossible (CHECK constraints).

---

## 9. Risks that remain

1. **Full sale creation is still not one transaction (Q4).** The `sales` row is
   inserted in the browser *before* the reserve/deduct RPC runs. If `Sale.create`
   succeeds but the RPC then fails (e.g. a stale‑cache race), an orphan sale can
   remain — `pending` (standard) or `completed` with no deduction (quick).
   Stock stays safe; the sale row is the inconsistency. Note: the friendly
   client‑side availability check usually rejects shortages *before* the sale is
   created, so this only triggers on a genuine race.
2. **Non‑sales inventory paths are still browser‑side.** Transfers, returns,
   damages, stock adjustments (via the Approvals page) and container receiving
   still do read‑modify‑write. The CHECK constraints prevent corruption
   (negative/over‑reserved), but these paths are not yet atomic and can race.
3. **Direct `UPDATE` on `inventory_stocks` is still granted** to `authenticated`.
   Stock can still be changed outside the RPCs (by the remaining browser paths or
   a crafted client). The RPCs are not yet the *only* way to change stock.
4. **Single shared database.** Local dev and production point at the same Supabase
   project, so any local testing affects live data. No isolated dev/staging DB.

---

## 10. Recommended next phases

1. **Full `create_sale` RPC (closes Q4).** One transaction that inserts the sale
   **and** reserves/deducts (and writes the release for the standard path).
   Removes the orphan‑sale window for both standard and quick sales.
2. **Migrate non‑sales inventory paths to RPCs:** transfers, returns, damages,
   stock adjustments (Approvals page).
3. **Container receiving RPC:** atomic stock‑in with `avg_cost_etb` recompute.
4. **Lock it down:** once *all* stock paths go through RPCs, `REVOKE` direct
   `UPDATE` on `inventory_stocks.quantity` / `reserved_quantity` from
   `authenticated`, so stock can only change through vetted functions.
5. **Optional — separate Supabase dev project** so future testing never touches
   live data.

---

*Checkpoint generated 2026-06-10. No app code or database was changed to produce
this document.*
