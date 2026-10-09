-- Aplicar UNA VEZ después de 20261011000100_integridad_programacion.sql.
-- Agrega parejas públicas de funciones disponibles. No modifica registros existentes.
begin;
alter function public.cine_cartelera() rename to cine_cartelera_modalidad_base;
revoke all on function public.cine_cartelera_modalidad_base() from public,anon,authenticated,service_role;

create function public.cine_cartelera() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(a.item || jsonb_build_object(
    'modalidades',m.pares,
    'idiomas',coalesce((select jsonb_agg(distinct x->>'idioma' order by x->>'idioma') from jsonb_array_elements(m.pares) x),'[]'),
    'formatos',coalesce((select jsonb_agg(distinct x->>'formato' order by x->>'formato') from jsonb_array_elements(m.pares) x),'[]')
  ) order by a.item->>'titulo'),'[]')
  from jsonb_array_elements(public.cine_cartelera_modalidad_base()) a(item)
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('idioma',p.idioma,'formato',p.formato) order by p.idioma,p.formato),'[]') pares
    from (
      select distinct f.idioma,f.formato from public.cine_funciones f
      join public.cine_salas s on s.id=f.sala_id and s.activa
      where f.pelicula_id=(a.item->>'id')::uuid and f.activa and f.inicio>now()
    ) p
  ) m;
$$;
revoke all on function public.cine_cartelera() from public,anon,authenticated;
grant execute on function public.cine_cartelera() to anon,authenticated;
notify pgrst,'reload schema';
commit;
