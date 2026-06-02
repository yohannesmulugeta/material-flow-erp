-- ============================================================
-- Soft delete + audit trail columns on all business tables
-- ============================================================

-- Add archived / audit columns to every business table.
-- All nullable so existing rows are unaffected.

do $$
declare t text;
begin
  for t in select unnest(array[
    'products','product_categories','warehouses','suppliers','customers',
    'containers','container_items','inventory_stocks','stock_transactions',
    'sales','sales_returns','stock_adjustments','damage_records','transfers',
    'accounts','account_transactions','payments','approval_requests','attachments'
  ]) loop
    -- Soft delete
    execute format('alter table public.%I add column if not exists archived bool not null default false', t);
    execute format('alter table public.%I add column if not exists archived_at timestamptz', t);
    execute format('alter table public.%I add column if not exists archived_by text', t);
    execute format('alter table public.%I add column if not exists archive_reason text', t);
    -- Audit trail
    execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id)', t);
  end loop;
end $$;

-- Partial index so active-record queries are fast (skip archived rows)
do $$
declare t text;
begin
  for t in select unnest(array[
    'sales','payments','transfers','damage_records','sales_returns',
    'stock_adjustments','containers','suppliers','customers','products'
  ]) loop
    execute format(
      'create index if not exists %I on public.%I (created_at desc) where archived = false',
      t || '_active_idx', t
    );
  end loop;
end $$;

-- updated_by auto-set trigger
create or replace function public.set_updated_by()
returns trigger language plpgsql as $$
begin
  new.updated_by = auth.uid();
  return new;
end; $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'products','warehouses','suppliers','customers','containers',
    'sales','payments','transfers','damage_records','sales_returns',
    'stock_adjustments','accounts','approval_requests'
  ]) loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_by', t);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.set_updated_by()',
      t || '_set_updated_by', t
    );
  end loop;
end $$;

-- Grant coverage for new columns
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
