-- Normaliza valores históricos para que los filtros públicos coincidan con las
-- modalidades usadas por las funciones nuevas.
begin;

update public.peliculas
set idioma='castellano'
where lower(trim(idioma)) in ('español','espanol');

update public.cine_funciones
set idioma='castellano'
where lower(trim(idioma)) in ('español','espanol');

update public.peliculas
set formato=upper(trim(formato))
where formato is not null;

update public.cine_funciones
set formato=upper(trim(formato))
where formato is not null;

create or replace function public.cine_cartelera() returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(a.item || jsonb_build_object(
    'modalidades',m.pares,
    'idiomas',coalesce((select jsonb_agg(distinct x->>'idioma' order by x->>'idioma')
      from jsonb_array_elements(m.pares) x),'[]'),
    'formatos',coalesce((select jsonb_agg(distinct x->>'formato' order by x->>'formato')
      from jsonb_array_elements(m.pares) x),'[]')
  ) order by a.item->>'titulo'),'[]')
  from jsonb_array_elements(public.cine_cartelera_modalidad_base()) a(item)
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'idioma',
        case
          when lower(trim(f.idioma)) in ('español','espanol') then 'castellano'
          else lower(trim(f.idioma))
        end,
      'formato',upper(trim(f.formato))
    ) order by f.idioma,f.formato),'[]') pares
    from (
      select distinct f.idioma,f.formato
      from public.cine_funciones f
      join public.cine_salas s on s.id=f.sala_id and s.activa
      where f.pelicula_id=(a.item->>'id')::uuid
        and f.activa
        and f.inicio>now()
        and lower(trim(f.idioma)) in ('castellano','español','espanol','subtitulada')
        and upper(trim(f.formato)) in ('2D','3D','4D','5D')
    ) f
  ) m;
$$;

revoke all on function public.cine_cartelera() from public,anon,authenticated;
grant execute on function public.cine_cartelera() to anon,authenticated;
notify pgrst,'reload schema';
commit;
