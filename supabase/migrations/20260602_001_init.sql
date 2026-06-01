-- ============================================================================
-- Material Flow ERP — initial schema
-- One file, idempotent up to CREATE ... IF NOT EXISTS. Do not re-run on a
-- populated DB without inspection.
-- Follows the KKGT migration runbook (Phase 2).
-- ============================================================================

-- ---------------------------------------------------------------- GRANTs TOP
-- Required because `supabase db push` runs as postgres and does not inherit
-- the auto-grants supabase_admin gets via the dashboard creation path.
-- Without these, every PostgREST request returns 403 even with correct RLS.

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------- HELPER FUNCTIONS
-- Note: language plpgsql defers parsing — these can reference tables that
-- are created later in the same file. SQL-language helpers (is_admin etc.)
-- are defined AFTER profiles below.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    'unassigned'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- Trim trigger generator — applied to join-key text columns at bottom.
create or replace function public.trim_text_columns()
returns trigger language plpgsql as $$
declare
  col text;
  cols text[] := tg_argv[0]::text[];
  val text;
begin
  foreach col in array cols
  loop
    execute format('select ($1).%I::text', col) using new into val;
    if val is not null then
      val := trim(val);
      if val = '' then val := null; end if;
      new := jsonb_populate_record(new, jsonb_build_object(col, val)) ;
    end if;
  end loop;
  return new;
end; $$;
-- ^ jsonb-based generic trimmer is fragile across types; we use per-column
-- triggers below instead. Keeping the function around as a future utility.

-- =============================================================== PROFILES ==
-- Mirrors auth.users. Created early because many policies reference it.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  phone text,
  role text not null default 'unassigned',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Now we can define SQL-language role helpers that read profiles.
create or replace function public.current_role_name()
returns text language sql stable as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (select role in ('super_admin','admin','manager') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable as $$
  select coalesce(
    (select role in ('super_admin','admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_role_assigned()
returns boolean language sql stable as $$
  select coalesce(
    (select role <> 'unassigned' from public.profiles where id = auth.uid()),
    false
  );
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auth.users → profiles trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================= TABLES ==
-- Per runbook: every table has created_by; required list matches JSONC exactly;
-- text columns for JSON-typed Base44 strings; trim triggers added at bottom.

-- --- product_categories
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists product_categories_name_uidx
  on public.product_categories (lower(name));

-- --- warehouses
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists warehouses_name_uidx
  on public.warehouses (lower(name));

-- --- suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  contact_person text,
  phone text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists suppliers_name_uidx
  on public.suppliers (lower(name));

-- --- customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(18,2) not null default 0,
  total_credit numeric(18,2) not null default 0,
  total_paid numeric(18,2) not null default 0,
  balance numeric(18,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- --- products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null,
  category_id uuid references public.product_categories(id) on delete set null,
  brand text,
  unit text,
  description text,
  status text not null default 'active',
  min_stock_level numeric(18,3) not null default 0,
  max_stock_level numeric(18,3) not null default 0,
  reorder_level  numeric(18,3) not null default 0,
  preferred_warehouse_id uuid references public.warehouses(id) on delete set null,
  default_selling_price numeric(18,2) not null default 0,
  tax_rate numeric(6,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists products_sku_uidx on public.products (sku);

-- --- containers (imports / shipments)
create table if not exists public.containers (
  id uuid primary key default gen_random_uuid(),
  container_number text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  country text,
  arrival_date date,
  currency text not null default 'USD',
  exchange_rate numeric(18,6),
  freight_cost numeric(18,2) not null default 0,
  insurance_cost numeric(18,2) not null default 0,
  customs_cost numeric(18,2) not null default 0,
  transport_cost numeric(18,2) not null default 0,
  loading_cost numeric(18,2) not null default 0,
  unloading_cost numeric(18,2) not null default 0,
  other_costs numeric(18,2) not null default 0,
  total_product_cost_usd numeric(18,2) not null default 0,
  total_import_cost_etb numeric(18,2) not null default 0,
  status text not null default 'in_transit',
  notes text,
  receiving_warehouse_id uuid references public.warehouses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists containers_number_uidx
  on public.containers (container_number);

-- --- container_items
create table if not exists public.container_items (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references public.containers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  quantity numeric(18,3) not null,
  unit_cost_usd numeric(18,4),
  total_cost_usd numeric(18,2),
  landed_cost_per_unit_etb numeric(18,4),
  total_landed_cost_etb numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- --- inventory_stocks (per product per warehouse)
create table if not exists public.inventory_stocks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  warehouse_name text,
  quantity numeric(18,3) not null default 0,
  avg_cost_etb numeric(18,4) not null default 0,
  total_value_etb numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists inventory_stocks_pw_uidx
  on public.inventory_stocks (product_id, warehouse_id);

-- --- stock_transactions (ledger of every stock movement)
create table if not exists public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  warehouse_name text,
  type text not null,                 -- stock_in | stock_out
  reason text not null,               -- container_receiving | purchase | return | adjustment | sale | transfer_out | transfer_in | damage | loss
  quantity numeric(18,3) not null,
  unit_cost_etb numeric(18,4),
  reference_id text,                  -- text not uuid (cross-entity refs)
  reference_type text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists stock_tx_product_idx on public.stock_transactions (product_id, created_at desc);
create index if not exists stock_tx_warehouse_idx on public.stock_transactions (warehouse_id, created_at desc);

-- --- sales
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  warehouse_name text,
  sale_type text not null default 'cash',
  items text,                         -- JSON string per Base44 contract (DO NOT use jsonb)
  subtotal numeric(18,2) not null default 0,
  discount numeric(18,2) not null default 0,
  tax numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  total_cost numeric(18,2) not null default 0,
  total_profit numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  status text not null default 'completed',
  sale_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists sales_invoice_uidx on public.sales (invoice_number);

-- --- sales_returns
create table if not exists public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  invoice_number text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  quantity numeric(18,3) not null,
  unit_cost numeric(18,4),
  reason text,                        -- defective|wrong_product|customer_complaint|other
  reason_notes text,
  approved_by text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- --- stock_adjustments
create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  warehouse_name text,
  system_quantity numeric(18,3),
  actual_quantity numeric(18,3) not null,
  difference numeric(18,3),
  reason text,
  requested_by text,
  approved_by text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- --- damage_records
create table if not exists public.damage_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  warehouse_name text,
  quantity numeric(18,3) not null,
  reason text,
  type text not null default 'damage',
  recorded_by text,
  approved_by text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- --- transfers
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  quantity numeric(18,3) not null,
  source_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  source_warehouse_name text,
  destination_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  destination_warehouse_name text,
  reason text,
  requested_by text,
  approved_by text,
  status text not null default 'pending',
  transfer_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.transfers
  add constraint transfers_diff_warehouses_chk
  check (source_warehouse_id <> destination_warehouse_id) not valid;

-- --- accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'formal',   -- formal | informal
  balance numeric(18,2) not null default 0,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- --- account_transactions
create table if not exists public.account_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  account_name text,
  type text not null,                  -- deposit | withdrawal | transfer_in | transfer_out
  amount numeric(18,2) not null,
  reference_type text,
  reference_id text,                   -- text, not uuid (cross-entity)
  notes text,
  balance_after numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists acct_tx_account_idx on public.account_transactions (account_id, created_at desc);

-- --- payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  type text not null,                  -- customer_payment | supplier_payment
  reference_id text not null,          -- customer/supplier id, kept as text per JSONC
  reference_name text,
  sale_id uuid references public.sales(id) on delete set null,
  amount numeric(18,2) not null,
  payment_method text,
  account_id uuid references public.accounts(id) on delete set null,
  account_name text,
  payment_date date,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- --- approval_requests
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null,                  -- transfer|return|damage|stock_adjustment|payment_edit|payment_delete|record_delete
  reference_id text not null,
  reference_type text not null,
  reference_label text,
  requested_by text,
  requested_by_id text,
  approved_by text,
  notes text,
  payload text,                        -- JSON string per JSONC
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists approval_status_idx on public.approval_requests (status, created_at desc);

-- --- activity_logs
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  module text not null,
  action text not null,
  entity_type text,
  entity_id text,
  description text,
  previous_value text,                 -- JSON string
  new_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists activity_logs_recent_idx on public.activity_logs (created_at desc);

-- --- attachments (Document Vault — Phase 13)
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,         -- 'sale','container','supplier','payment',...
  entity_id text not null,
  storage_path text not null,        -- the path inside the storage bucket
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists attachments_entity_idx
  on public.attachments (entity_type, entity_id);

-- ================================================ updated_at TRIGGERS LOOP ==
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','product_categories','warehouses','suppliers','customers',
    'products','containers','container_items','inventory_stocks',
    'stock_transactions','sales','sales_returns','stock_adjustments',
    'damage_records','transfers','accounts','account_transactions',
    'payments','approval_requests','activity_logs','attachments'
  ]) loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ============================================ TRIM TRIGGERS ON JOIN KEYS ====
-- Whitespace bugs are silent killers (Bug index #13).

create or replace function public.trim_supplier_name()
returns trigger language plpgsql as $$
begin
  if new.supplier_name is not null then
    new.supplier_name := trim(new.supplier_name);
    if new.supplier_name = '' then new.supplier_name := null; end if;
  end if;
  return new;
end; $$;

create or replace function public.trim_customer_name()
returns trigger language plpgsql as $$
begin
  if new.customer_name is not null then
    new.customer_name := trim(new.customer_name);
    if new.customer_name = '' then new.customer_name := null; end if;
  end if;
  return new;
end; $$;

create or replace function public.trim_product_name()
returns trigger language plpgsql as $$
begin
  if new.product_name is not null then
    new.product_name := trim(new.product_name);
    if new.product_name = '' then new.product_name := null; end if;
  end if;
  return new;
end; $$;

create or replace function public.trim_warehouse_name()
returns trigger language plpgsql as $$
begin
  if new.warehouse_name is not null then
    new.warehouse_name := trim(new.warehouse_name);
    if new.warehouse_name = '' then new.warehouse_name := null; end if;
  end if;
  return new;
end; $$;

do $$
declare t text;
begin
  -- supplier_name (note: suppliers table uses 'name', not 'supplier_name')
  for t in select unnest(array['containers']) loop
    execute format('drop trigger if exists %I_trim_supplier_name on public.%I', t, t);
    execute format('create trigger %I_trim_supplier_name before insert or update of supplier_name on public.%I for each row execute function public.trim_supplier_name()', t, t);
  end loop;
  -- customer_name (note: customers table uses 'name'; payments uses 'reference_name')
  for t in select unnest(array['sales','sales_returns']) loop
    execute format('drop trigger if exists %I_trim_customer_name on public.%I', t, t);
    execute format('create trigger %I_trim_customer_name before insert or update of customer_name on public.%I for each row execute function public.trim_customer_name()', t, t);
  end loop;
  -- product_name (note: products table uses 'name', not 'product_name')
  for t in select unnest(array['container_items','inventory_stocks','stock_transactions','sales_returns','stock_adjustments','damage_records','transfers']) loop
    execute format('drop trigger if exists %I_trim_product_name on public.%I', t, t);
    execute format('create trigger %I_trim_product_name before insert or update of product_name on public.%I for each row execute function public.trim_product_name()', t, t);
  end loop;
  -- warehouse_name (note: warehouses table uses 'name', not 'warehouse_name')
  for t in select unnest(array['inventory_stocks','stock_transactions','sales','stock_adjustments','damage_records']) loop
    execute format('drop trigger if exists %I_trim_warehouse_name on public.%I', t, t);
    execute format('create trigger %I_trim_warehouse_name before insert or update of warehouse_name on public.%I for each row execute function public.trim_warehouse_name()', t, t);
  end loop;
end $$;

-- ================================================================== RLS ====
-- Enable on every business table.

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','product_categories','warehouses','suppliers','customers',
    'products','containers','container_items','inventory_stocks',
    'stock_transactions','sales','sales_returns','stock_adjustments',
    'damage_records','transfers','accounts','account_transactions',
    'payments','approval_requests','activity_logs','attachments'
  ]) loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- profiles policies (special: self_read + admin_*)
drop policy if exists "profiles_self_read"   on public.profiles;
drop policy if exists "profiles_admin_read"  on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_admin_write" on public.profiles;

create policy "profiles_self_read"   on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles_admin_read"  on public.profiles for select to authenticated
  using (public.is_admin());
create policy "profiles_self_update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "profiles_admin_write" on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- standard 4-policy pattern for every business table with created_by
do $$
declare t text;
begin
  for t in select unnest(array[
    'product_categories','warehouses','suppliers','customers',
    'products','containers','container_items','inventory_stocks',
    'stock_transactions','sales','sales_returns','stock_adjustments',
    'damage_records','transfers','accounts','account_transactions',
    'payments','approval_requests','attachments'
  ]) loop
    execute format('drop policy if exists %I on public.%I', t || '_select_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_self_or_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_admin', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_role_assigned())',
      t || '_insert_auth', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (created_by = auth.uid() or public.is_admin()) '
      'with check (created_by = auth.uid() or public.is_admin())',
      t || '_update_self_or_admin', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      'using (public.is_admin())',
      t || '_delete_admin', t);
  end loop;
end $$;

-- ---- activity_logs (audit): INSERT + SELECT for auth, UPDATE/DELETE admin only
drop policy if exists "activity_logs_select_auth" on public.activity_logs;
drop policy if exists "activity_logs_insert_auth" on public.activity_logs;
drop policy if exists "activity_logs_update_admin" on public.activity_logs;
drop policy if exists "activity_logs_delete_admin" on public.activity_logs;
create policy "activity_logs_select_auth" on public.activity_logs for select to authenticated using (true);
create policy "activity_logs_insert_auth" on public.activity_logs for insert to authenticated with check (true);
create policy "activity_logs_update_admin" on public.activity_logs for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "activity_logs_delete_admin" on public.activity_logs for delete to authenticated using (public.is_super_admin());

-- ---- approval_requests: tighter — only admins approve/reject
drop policy if exists "approval_requests_select_auth" on public.approval_requests;
drop policy if exists "approval_requests_insert_auth" on public.approval_requests;
drop policy if exists "approval_requests_update_admin_or_self_cancel" on public.approval_requests;
drop policy if exists "approval_requests_delete_admin" on public.approval_requests;
create policy "approval_requests_select_auth" on public.approval_requests for select to authenticated using (true);
create policy "approval_requests_insert_auth" on public.approval_requests for insert to authenticated with check (public.is_role_assigned());
create policy "approval_requests_update_admin_or_self_cancel" on public.approval_requests for update to authenticated
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());
create policy "approval_requests_delete_admin" on public.approval_requests for delete to authenticated using (public.is_super_admin());

-- =============================================================== STORAGE ===
-- Document Vault bucket (Phase 13). Private; signed URLs only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 10485760,
  array[
    'application/pdf','image/jpeg','image/png','image/webp','image/heic',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv','text/plain'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "attachments_insert_auth" on storage.objects;
drop policy if exists "attachments_select_auth" on storage.objects;
drop policy if exists "attachments_update_owner" on storage.objects;
drop policy if exists "attachments_delete_admin" on storage.objects;

create policy "attachments_insert_auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');
create policy "attachments_select_auth" on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
create policy "attachments_update_owner" on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or public.is_admin()));
create policy "attachments_delete_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.is_admin());

-- =============================================================== SEED ======
-- Minimal reference data so the app loads.
insert into public.product_categories (name, description) values
  ('Uncategorized', 'Default category')
on conflict do nothing;

insert into public.warehouses (name, location, description) values
  ('Main Warehouse', 'Primary location', 'Default warehouse')
on conflict do nothing;

insert into public.accounts (name, type, description) values
  ('Cash', 'informal', 'Petty cash'),
  ('Bank — Main', 'formal', 'Primary bank account')
on conflict do nothing;

-- =============================================================== GRANTs BOT
-- Covers tables that didn't exist when default privileges were set.

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- ============================================================================
-- End of init. After applying:
--   1. Sign in once via Google in the app.
--   2. update public.profiles set role='super_admin' where lower(email)=lower('YOU@example.com');
--   3. Hard-reload the app.
-- ============================================================================
