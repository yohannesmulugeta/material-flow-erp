-- ============================================================================
-- ERP v2 — Product Variants, Packaging/Unit Conversion, Stock Reservation,
--          Sales Release Workflow, Warehouse Releases
--
-- ADDITIVE & SAFE: existing product_id-based rows keep working. New variant_id
-- columns are nullable. Nothing is dropped.
-- ============================================================================

-- ── Products: image fields ───────────────────────────────────────────────────
alter table public.products add column if not exists main_image_url text;
alter table public.products add column if not exists additional_images text;  -- JSON array of URLs (text per Base44 convention)
alter table public.products add column if not exists has_variants bool not null default false;

-- ── product_variants ─────────────────────────────────────────────────────────
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null,
  sku text not null,
  barcode text,
  size text,
  color text,
  material text,
  -- Packaging / unit conversion. All stock stored in BASE unit.
  base_unit text not null default 'pcs',     -- e.g. 'pcs'
  purchase_unit text,                         -- e.g. 'carton'
  sales_unit text,                            -- e.g. 'pcs'
  conversion_rate numeric(18,4) not null default 1,  -- 1 purchase_unit = N base units
  cost_price numeric(18,2) not null default 0,
  selling_price numeric(18,2) not null default 0,
  min_stock_level numeric(18,3) not null default 0,
  status text not null default 'active',
  archived bool not null default false,
  archived_at timestamptz,
  archived_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create unique index if not exists product_variants_sku_uidx
  on public.product_variants (lower(sku)) where archived = false;
create unique index if not exists product_variants_barcode_uidx
  on public.product_variants (lower(barcode)) where barcode is not null and archived = false;
create index if not exists product_variants_product_idx on public.product_variants (product_id);

-- ── Inventory: variant + reservation ─────────────────────────────────────────
alter table public.inventory_stocks add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;
alter table public.inventory_stocks add column if not exists variant_name text;
alter table public.inventory_stocks add column if not exists reserved_quantity numeric(18,3) not null default 0;
alter table public.inventory_stocks add column if not exists latest_landed_cost_etb numeric(18,4);
-- available_quantity is computed in app (quantity - reserved_quantity)

-- Unique per (product, variant, warehouse). Drop old (product, warehouse) only-unique if needed.
create unique index if not exists inventory_stocks_pvw_uidx
  on public.inventory_stocks (product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), warehouse_id);

-- ── Sales: workflow status + variant items ───────────────────────────────────
-- Existing sales.status used 'completed'/'cancelled'. We add a richer workflow_status.
alter table public.sales add column if not exists workflow_status text not null default 'completed';
-- workflow_status: draft | approved | pending_release | picking | released | completed | cancelled
alter table public.sales add column if not exists approved_by text;
alter table public.sales add column if not exists approved_at timestamptz;
alter table public.sales add column if not exists released_by text;
alter table public.sales add column if not exists released_at timestamptz;
alter table public.sales add column if not exists completed_at timestamptz;

-- ── stock_transactions: variant ──────────────────────────────────────────────
alter table public.stock_transactions add column if not exists variant_id uuid references public.product_variants(id) on delete set null;
alter table public.stock_transactions add column if not exists variant_name text;

-- ── warehouse_releases ───────────────────────────────────────────────────────
create table if not exists public.warehouse_releases (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  invoice_number text,
  customer_name text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  warehouse_name text,
  items text,                                  -- JSON snapshot of items being released
  released_by text,                            -- name typed by warehouse staff
  release_date date,
  note text,
  item_condition text,                         -- condition of items
  pick_status text not null default 'pending', -- pending | picking | picked | released
  status text not null default 'pending',      -- pending | approved | rejected (admin final)
  approved_by text,
  approved_at timestamptz,
  archived bool not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create index if not exists warehouse_releases_sale_idx on public.warehouse_releases (sale_id);
create index if not exists warehouse_releases_status_idx on public.warehouse_releases (status, created_at desc);

-- ── updated_at triggers for new tables ───────────────────────────────────────
drop trigger if exists product_variants_updated_at on public.product_variants;
create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

drop trigger if exists warehouse_releases_updated_at on public.warehouse_releases;
create trigger warehouse_releases_updated_at before update on public.warehouse_releases
  for each row execute function public.set_updated_at();

-- updated_by triggers
drop trigger if exists product_variants_set_updated_by on public.product_variants;
create trigger product_variants_set_updated_by before update on public.product_variants
  for each row execute function public.set_updated_by();
drop trigger if exists warehouse_releases_set_updated_by on public.warehouse_releases;
create trigger warehouse_releases_set_updated_by before update on public.warehouse_releases
  for each row execute function public.set_updated_by();

-- trim variant_name on referencing tables
drop trigger if exists inventory_stocks_trim_variant_name on public.inventory_stocks;

-- ── RLS for new tables (4-policy pattern) ────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array['product_variants','warehouse_releases']) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_self_or_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_admin', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select_auth', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_role_assigned())', t || '_insert_auth', t);
    execute format('create policy %I on public.%I for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin())', t || '_update_self_or_admin', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete_admin', t);
  end loop;
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;
