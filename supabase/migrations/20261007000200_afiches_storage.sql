-- Aplicar después de operacion_cine. No contiene claves privadas.
begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('afiches-cine', 'afiches-cine', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
do $$
begin
  if not exists(select 1 from storage.buckets where id='afiches-cine' and public
    and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
    raise exception 'El bucket afiches-cine ya existe con otra configuración. Revisar antes de continuar';
  end if;
end $$;
-- Solo administradores activos, nombres aleatorios y carpetas propias.
-- No se permite UPDATE/upsert: cambiar un afiche crea un archivo nuevo.
create policy cine_afiches_insertar_admin on storage.objects
for insert to authenticated with check (
  bucket_id = 'afiches-cine' and public.cine_rol(array['administrador'])
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
);
-- Descargas públicas por diseño del bucket; sin listado público ni mutaciones de invitados.
-- Afiches antiguos se gestionan desde Storage Dashboard: no borrarlos automáticamente,
-- podrían estar referenciados por otras películas.
commit;
