-- Corrección mínima autorizada antes de publicar: sin borrar filas ni cambiar RLS/Realtime.
-- Ejecutar una sola vez. No repetir migraciones anteriores.
begin;
revoke insert,update,delete,truncate,references,trigger on public.cine_eventos_publicos from public,anon,authenticated;
-- Una revocación de tabla no elimina posibles permisos otorgados por columna.
do $$ declare c record;begin
  for c in select attname from pg_attribute where attrelid='public.cine_eventos_publicos'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke insert(%I),update(%I),references(%I) on public.cine_eventos_publicos from public,anon,authenticated',c.attname,c.attname,c.attname);
  end loop;
end $$;
commit;
