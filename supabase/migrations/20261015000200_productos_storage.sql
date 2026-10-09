-- Aplicar UNA VEZ después de 20261015000100. Requiere Supabase Storage.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('productos-cine','productos-cine',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='productos-cine' and public
    and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
    raise exception 'El bucket productos-cine existe con otra configuración: revisar sin sobrescribir';end if;
end $$;
create policy cine_productos_imagen_insertar_admin on storage.objects
for insert to authenticated with check (
  bucket_id='productos-cine' and public.cine_rol(array['administrador'])
  and (storage.foldername(name))[1]=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
);
-- Sin UPDATE/upsert/DELETE ni listado público. Cada reemplazo crea otra imagen.
create or replace function public.cine_validar_imagen_producto(p_ruta text,p_anterior text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_ruta is not null and p_ruta is distinct from p_anterior and (
    p_ruta !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    or split_part(p_ruta,'/',1) is distinct from auth.uid()::text
    or not exists(select 1 from storage.objects where bucket_id='productos-cine' and name=p_ruta)) then
    raise exception 'Imagen de producto inválida: subí el archivo desde tu cuenta';end if;
end $$;
commit;
