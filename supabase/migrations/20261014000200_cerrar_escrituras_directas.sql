-- Después de administración e integridad. No cambia filas ni lecturas de catálogo.
-- Todas las escrituras pasan por las RPC con validación y auditoría del backend.
begin;
revoke insert,update,delete on public.perfiles,public.generos,public.peliculas,public.peliculas_generos from public,anon,authenticated;
-- REVOKE sobre tabla no retira grants antiguos por columna (p.ej. nombre/apellido).
do $$
declare t text;c record;
begin
  foreach t in array array['perfiles','generos','peliculas','peliculas_generos'] loop
    for c in select attname from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped loop
      execute format('revoke insert(%I),update(%I) on public.%I from public,anon,authenticated',c.attname,c.attname,t);
    end loop;
  end loop;
end $$;

alter policy cine_funciones_leer on public.cine_funciones using (
  public.cine_rol(array['administrador']) or (
    activa
    and exists(select 1 from public.peliculas p where p.id=pelicula_id and p.activa)
    and exists(select 1 from public.cine_salas s where s.id=sala_id and s.activa)
  )
);
commit;
