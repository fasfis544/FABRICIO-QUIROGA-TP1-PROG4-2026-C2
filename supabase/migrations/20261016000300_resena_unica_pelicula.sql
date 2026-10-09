-- Aplicar UNA VEZ después de los bloques hasta 20261015000300.
-- Independiente de 20261016000100/20261016000200; no repetirlos después.
-- No borra ni modifica reseñas históricas, compras, entradas o movimientos.
begin;

-- Copia estable. El guard de archivo de abajo también rechaza escrituras legadas en vuelo.
lock table public.cine_resenas in share row exclusive mode;

create table public.cine_resenas_pelicula (
  usuario_id uuid not null references auth.users(id),
  pelicula_id uuid not null references public.peliculas(id),
  id uuid not null unique default gen_random_uuid(),
  reserva_id uuid not null references public.cine_reservas(id),
  resena_historica_id uuid references public.cine_resenas(id),
  nombre text not null,
  calificacion integer not null check(calificacion between 1 and 5),
  texto text not null check(length(trim(texto)) between 1 and 2000),
  creada timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  primary key(usuario_id,pelicula_id)
);
create index cine_resenas_pelicula_publicas on public.cine_resenas_pelicula(pelicula_id,actualizada_en desc,id);
alter table public.cine_resenas_pelicula enable row level security;
revoke all on public.cine_resenas_pelicula from public,anon,authenticated,service_role;

-- Una opinión vigente por cuenta/película: la histórica de creación más reciente.
-- El ID desempata de forma determinista. Todas las originales siguen intactas.
insert into public.cine_resenas_pelicula(
  usuario_id,pelicula_id,id,reserva_id,resena_historica_id,nombre,calificacion,texto,creada,actualizada_en
)
select distinct on(usuario_id,pelicula_id)
  usuario_id,pelicula_id,id,reserva_id,id,nombre,calificacion,texto,creada,creada
from public.cine_resenas order by usuario_id,pelicula_id,creada desc,id desc;

-- No dejar que una llamada vieja ya iniciada escriba en el archivo después de la copia.
-- Ante ese caso la solicitud falla y puede reintentarse por la RPC nueva; no se pierde una opinión silenciosamente.
create function public.cine_proteger_resenas_historicas() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Las reseñas históricas son de solo lectura. Actualizá la pantalla y guardá la opinión vigente de la película';
end $$;
revoke all on function public.cine_proteger_resenas_historicas() from public,anon,authenticated,service_role;
create trigger cine_resenas_archivo before insert or update or delete on public.cine_resenas
  for each row execute function public.cine_proteger_resenas_historicas();

create or replace function public.cine_escribir_resena(p_token uuid,p_calificacion integer,p_texto text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;v_pelicula uuid;v_nombre text;
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
  select * into r from public.cine_reservas where token=p_token and usuario_id=auth.uid() and estado='confirmada';
  if not found or not exists(select 1 from public.cine_entradas where reserva_id=r.id and usada_en is not null) then
    raise exception 'Solo podés reseñar una película con entrada utilizada';end if;
  if p_calificacion is null or p_calificacion not between 1 and 5 or p_texto is null
    or length(trim(p_texto)) not between 1 and 2000 then raise exception 'Calificación o reseña inválida';end if;
  select pelicula_id into v_pelicula from public.cine_funciones where id=r.funcion_id;
  select coalesce(nullif(trim(nombre),''),'Cliente') into v_nombre from public.perfiles where id=auth.uid();
  -- La clave primaria arbitra también dos primeros envíos concurrentes de compras distintas.
  insert into public.cine_resenas_pelicula(usuario_id,pelicula_id,reserva_id,nombre,calificacion,texto)
    values(auth.uid(),v_pelicula,r.id,v_nombre,p_calificacion,trim(p_texto))
    on conflict(usuario_id,pelicula_id) do update set reserva_id=excluded.reserva_id,
      nombre=excluded.nombre,calificacion=excluded.calificacion,texto=excluded.texto,
      actualizada_en=clock_timestamp();
end $$;

create or replace function public.cine_resenas_publicas(p_pelicula uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'promedio',coalesce((select round(avg(calificacion),1) from public.cine_resenas_pelicula where pelicula_id=p_pelicula),0),
    'resenas',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'nombre',nombre,'calificacion',calificacion,'texto',texto,'creada',creada,
      'actualizada_en',actualizada_en) order by actualizada_en desc,id)
      from public.cine_resenas_pelicula where pelicula_id=p_pelicula),'[]'::jsonb));
$$;

create or replace function public.cine_mi_reserva(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.cine_reservas;v public.cine_resenas_pelicula;
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) then
    raise exception 'Reserva no disponible para tu cuenta';end if;
  select * into r from public.cine_reservas where token=p_token and usuario_id=auth.uid();
  if not found then raise exception 'Reserva no disponible para tu cuenta';end if;
  select s.* into v from public.cine_resenas_pelicula s join public.cine_funciones f on f.pelicula_id=s.pelicula_id
    where f.id=r.funcion_id and s.usuario_id=auth.uid();
  return public.cine_detalle_reserva(p_token)||jsonb_build_object(
    'resena_por_pelicula',true,'calificacion_propia',v.calificacion,'texto_propio',v.texto);
end $$;

create or replace function public.cine_mis_reservas() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
  return coalesce((select jsonb_agg(public.cine_mi_reserva(token) order by creada desc,id)
    from public.cine_reservas where usuario_id=auth.uid()),'[]'::jsonb);
end $$;

-- No se amplía el contrato de cine_detalle_reserva/cine_comprobante (portador).
revoke all on function public.cine_escribir_resena(uuid,integer,text),public.cine_resenas_publicas(uuid),
  public.cine_mi_reserva(uuid),public.cine_mis_reservas() from public,anon,authenticated,service_role;
grant execute on function public.cine_escribir_resena(uuid,integer,text),public.cine_mi_reserva(uuid),public.cine_mis_reservas() to authenticated;
grant execute on function public.cine_resenas_publicas(uuid) to anon,authenticated;
commit;
