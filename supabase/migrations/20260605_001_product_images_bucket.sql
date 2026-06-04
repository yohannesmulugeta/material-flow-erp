-- Public bucket for product/variant images (displayed across the app)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic']
)
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_insert_auth" on storage.objects;
drop policy if exists "product_images_select_public" on storage.objects;
drop policy if exists "product_images_update_auth" on storage.objects;
drop policy if exists "product_images_delete_admin" on storage.objects;

create policy "product_images_insert_auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images');
create policy "product_images_select_public" on storage.objects for select to public
  using (bucket_id = 'product-images');
create policy "product_images_update_auth" on storage.objects for update to authenticated
  using (bucket_id = 'product-images');
create policy "product_images_delete_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
