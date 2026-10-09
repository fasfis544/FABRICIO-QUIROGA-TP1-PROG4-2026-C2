-- Ejecutar completo una sola vez. En un proyecto nuevo aplicar primero 20261006000100_esquema_inicial.sql.
-- En el proyecto existente requiere perfiles, peliculas, generos y peliculas_generos ya creados.
begin;
alter table public.peliculas add column if not exists poster_url text;

create table public.cine_salas (
 id uuid primary key default gen_random_uuid(), nombre text not null unique,
 filas integer not null check (filas between 1 and 26), columnas integer not null check (columnas between 1 and 30),
 activa boolean not null default true
);
create table public.cine_funciones (
 id uuid primary key default gen_random_uuid(), pelicula_id uuid not null references public.peliculas(id),
 sala_id uuid not null references public.cine_salas(id), inicio timestamptz not null, fin timestamptz not null,
 precio numeric(12,2) not null check (precio > 0), activa boolean not null default true, check(fin > inicio)
);
create table public.cine_reservas (
 id uuid primary key default gen_random_uuid(), token uuid not null unique default gen_random_uuid(),
 solicitud uuid not null unique, funcion_id uuid not null references public.cine_funciones(id),
 usuario_id uuid references auth.users(id), email text not null, total numeric(12,2) not null,
 estado text not null default 'pendiente' check (estado in ('pendiente','confirmada')),
 vence timestamptz not null default (now() + interval '15 minutes'), creada timestamptz not null default now(),
 confirmada_por uuid references auth.users(id)
);
create table public.cine_entradas (
 id uuid primary key default gen_random_uuid(), reserva_id uuid not null references public.cine_reservas(id),
 funcion_id uuid not null references public.cine_funciones(id), butaca text not null,
 codigo uuid not null unique default gen_random_uuid(), usada_en timestamptz, usada_por uuid references auth.users(id),
 unique(funcion_id, butaca)
);
create index on public.cine_funciones(sala_id, inicio);
create index on public.cine_entradas(reserva_id);

create function public.cine_rol(p_roles text[]) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.perfiles where id = auth.uid() and activo and rol::text = any(p_roles));
$$;

alter table public.cine_salas enable row level security;
alter table public.cine_funciones enable row level security;
alter table public.cine_reservas enable row level security;
alter table public.cine_entradas enable row level security;
revoke all on public.cine_salas, public.cine_funciones, public.cine_reservas, public.cine_entradas from anon, authenticated;
grant select on public.cine_salas, public.cine_funciones to anon, authenticated;
create policy cine_salas_leer on public.cine_salas for select using(activa or public.cine_rol(array['administrador']));
create policy cine_funciones_leer on public.cine_funciones for select using(
 public.cine_rol(array['administrador']) or (activa and exists(select 1 from public.peliculas p where p.id=pelicula_id and p.activa))
);

create function public.cine_catalogo(p_admin boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_admin and not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado'; end if;
 return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('generos',coalesce((
 select jsonb_agg(jsonb_build_object('id',g.id,'nombre',g.nombre)) from public.generos g join public.peliculas_generos pg on pg.genero_id=g.id
 where pg.pelicula_id=p.id and (p_admin or coalesce((to_jsonb(g)->>'activo')::boolean,(to_jsonb(g)->>'activa')::boolean,true))), '[]'::jsonb)) order by p.titulo)
 from public.peliculas p where p_admin or p.activa), '[]'::jsonb);
end $$;

create function public.cine_guardar_pelicula(p_datos jsonb, p_generos uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.peliculas; v_id uuid;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado'; end if;
 select * into r from jsonb_populate_record(null::public.peliculas,p_datos);
 if nullif(trim(r.titulo),'') is null or r.slug is null or r.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or r.duracion_minutos is null or r.duracion_minutos not between 1 and 600 or r.fecha_estreno is null or r.clasificacion is null then
 raise exception 'Datos de película inválidos'; end if;
 if exists(select 1 from unnest(p_generos) x where not exists(select 1 from public.generos g where g.id=x and coalesce((to_jsonb(g)->>'activo')::boolean,(to_jsonb(g)->>'activa')::boolean,true))) then raise exception 'Género inválido'; end if;
 if r.id is null then
 insert into public.peliculas(titulo,slug,sinopsis,duracion_minutos,clasificacion,fecha_estreno,poster_url,activa)
 values(trim(r.titulo),r.slug,coalesce(r.sinopsis,''),r.duracion_minutos,r.clasificacion,r.fecha_estreno,r.poster_url,coalesce(r.activa,true)) returning id into v_id;
 else
 update public.peliculas set titulo=trim(r.titulo),slug=r.slug,sinopsis=coalesce(r.sinopsis,''),duracion_minutos=r.duracion_minutos,
 clasificacion=r.clasificacion,fecha_estreno=r.fecha_estreno,poster_url=r.poster_url,activa=coalesce(r.activa,true) where id=r.id returning id into v_id;
 if v_id is null then raise exception 'Película inexistente'; end if;
 end if;
 delete from public.peliculas_generos where pelicula_id=v_id;
 insert into public.peliculas_generos(pelicula_id,genero_id) select v_id,x from (select distinct unnest(p_generos) x) g;
 return v_id;
end $$;

create function public.cine_guardar_sala(p_nombre text,p_filas integer,p_columnas integer) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado'; end if;
 if length(trim(p_nombre)) not between 1 and 100 then raise exception 'Nombre inválido'; end if;
 insert into public.cine_salas(nombre,filas,columnas) values(trim(p_nombre),p_filas,p_columnas) returning id into v_id;
 return v_id;
end $$;

create function public.cine_crear_funcion(p_pelicula uuid,p_sala uuid,p_inicio timestamptz,p_precio numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare v_fin timestamptz; v_id uuid; minutos integer;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado'; end if;
 perform 1 from public.cine_salas where id=p_sala and activa for update;
 if not found then raise exception 'Sala inexistente o inactiva'; end if;
 select duracion_minutos into minutos from public.peliculas where id=p_pelicula and activa and fecha_estreno <= p_inicio::date;
 if not found or p_inicio <= now() or p_precio <= 0 then raise exception 'Función inválida'; end if;
 v_fin := p_inicio + (minutos + 30) * interval '1 minute';
 if exists(select 1 from public.cine_funciones where sala_id=p_sala and activa and inicio < v_fin and fin > p_inicio) then raise exception 'La sala ya tiene una función en ese horario'; end if;
 insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio) values(p_pelicula,p_sala,p_inicio,v_fin,p_precio) returning id into v_id;
 return v_id;
end $$;

create function public.cine_disponibilidad(p_funcion uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.cine_funciones; s public.cine_salas;
begin
 select * into f from public.cine_funciones where id=p_funcion and activa and inicio>now();
 if not found or not exists(select 1 from public.peliculas where id=f.pelicula_id and activa) then raise exception 'Función no disponible'; end if;
 select * into s from public.cine_salas where id=f.sala_id and activa;
 if not found then raise exception 'Sala no disponible'; end if;
 return jsonb_build_object('funcion',to_jsonb(f),'sala',to_jsonb(s),'ocupadas',coalesce((
 select jsonb_agg(e.butaca) from public.cine_entradas e join public.cine_reservas r on r.id=e.reserva_id
 where e.funcion_id=f.id and (r.estado='confirmada' or r.vence>now())), '[]'::jsonb));
end $$;

create function public.cine_comprobante(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.cine_reservas;
begin
 select * into r from public.cine_reservas where token=p_token;
 if not found then raise exception 'Reserva inexistente'; end if;
 return jsonb_build_object('token',r.token,'estado',case when r.estado='pendiente' and r.vence<=now() then 'vencida' else r.estado end,
 'total',r.total,'vence',r.vence,'funcion', (select to_jsonb(f) from public.cine_funciones f where f.id=r.funcion_id),
 'entradas',coalesce((select jsonb_agg(jsonb_build_object('butaca',butaca,'codigo',codigo,'usada_en',usada_en) order by butaca) from public.cine_entradas where reserva_id=r.id),'[]'::jsonb));
end $$;

create function public.cine_reservar(p_funcion uuid,p_butacas text[],p_email text,p_solicitud uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare f public.cine_funciones; s public.cine_salas; r public.cine_reservas; v_id uuid; v_token uuid;
begin
 select * into f from public.cine_funciones where id=p_funcion for update;
 if not found or not f.activa or f.inicio<=now() then raise exception 'Función no disponible'; end if;
 if not exists(select 1 from public.peliculas where id=f.pelicula_id and activa) then raise exception 'Película no disponible'; end if;
 select * into s from public.cine_salas where id=f.sala_id and activa;
 if not found then raise exception 'Sala no disponible'; end if;
 if p_butacas is null or cardinality(p_butacas) not between 1 and 8 or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_solicitud is null then raise exception 'Seleccioná de 1 a 8 butacas y un correo válido'; end if;
 if cardinality(p_butacas)<>(select count(distinct x) from unnest(p_butacas) x) or exists(
 select 1 from unnest(p_butacas) x where not exists(select 1 from generate_series(1,s.filas) a cross join generate_series(1,s.columnas) b where x=chr(64+a)||b::text)) then raise exception 'Butacas inválidas'; end if;
 if (select count(distinct left(x,1)) from unnest(p_butacas) x)<>1 or
 (select max(substring(x from 2)::integer)-min(substring(x from 2)::integer)+1 from unnest(p_butacas) x)<>cardinality(p_butacas) then raise exception 'Elegí butacas contiguas en una misma fila'; end if;
 select * into r from public.cine_reservas where solicitud=p_solicitud;
 if found then
 if r.funcion_id<>p_funcion or r.email<>trim(p_email) or (select array_agg(butaca order by butaca) from public.cine_entradas where reserva_id=r.id) is distinct from (select array_agg(x order by x) from unnest(p_butacas) x) then raise exception 'Solicitud ya utilizada'; end if;
 return r.token;
 end if;
 delete from public.cine_entradas e using public.cine_reservas vencida where e.reserva_id=vencida.id and e.funcion_id=f.id and vencida.estado='pendiente' and vencida.vence<=now();
 if exists(select 1 from public.cine_entradas where funcion_id=f.id and butaca=any(p_butacas)) then raise exception 'Una butaca ya fue reservada. Actualizá disponibilidad'; end if;
 insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,total,vence) values(p_solicitud,f.id,auth.uid(),trim(p_email),f.precio*cardinality(p_butacas),least(now()+interval '15 minutes',f.inicio)) returning id,token into v_id,v_token;
 insert into public.cine_entradas(reserva_id,funcion_id,butaca) select v_id,f.id,x from unnest(p_butacas) x;
 return v_token;
end $$;

create function public.cine_confirmar_reserva(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas; f public.cine_funciones;
begin
 if not public.cine_rol(array['empleado','administrador']) then raise exception 'Acceso denegado'; end if;
 select * into r from public.cine_reservas where token=p_token;
 if not found then raise exception 'Reserva inexistente'; end if;
 select * into f from public.cine_funciones where id=r.funcion_id for update;
 select * into r from public.cine_reservas where token=p_token for update;
 if r.estado='confirmada' then return public.cine_comprobante(p_token); end if;
 if r.vence<=now() or f.inicio<=now() or not f.activa then raise exception 'Reserva vencida o función no disponible'; end if;
 if not exists(select 1 from public.peliculas where id=f.pelicula_id and activa) or
 not exists(select 1 from public.cine_salas where id=f.sala_id and activa) then raise exception 'Película o sala no disponible'; end if;
 update public.cine_reservas set estado='confirmada',confirmada_por=auth.uid() where id=r.id;
 return public.cine_comprobante(p_token);
end $$;

create function public.cine_validar_entrada(p_codigo uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.cine_entradas; r public.cine_reservas; f public.cine_funciones;
begin
 if not public.cine_rol(array['empleado','administrador']) then raise exception 'Acceso denegado'; end if;
 select * into e from public.cine_entradas where codigo=p_codigo;
 if not found then raise exception 'Entrada inexistente'; end if;
 select * into f from public.cine_funciones where id=e.funcion_id for update;
 select * into e from public.cine_entradas where codigo=p_codigo for update;
 if not found then raise exception 'Entrada vencida'; end if;
 select * into r from public.cine_reservas where id=e.reserva_id;
 if r.estado<>'confirmada' then raise exception 'Reserva pendiente de pago en boletería'; end if;
 if e.usada_en is not null then raise exception 'Entrada ya utilizada'; end if;
 if not f.activa or now()<f.inicio-interval '30 minutes' or now()>f.fin then raise exception 'Fuera del horario de ingreso'; end if;
 update public.cine_entradas set usada_en=now(),usada_por=auth.uid() where id=e.id;
 return jsonb_build_object('butaca',e.butaca,'funcion',f.id,'mensaje','Ingreso autorizado');
end $$;

-- Solo las RPC públicas de lectura/reserva admiten invitados. No se permite acceso directo a entradas o datos personales.
do $$ declare f record; begin
 for f in select oid::regprocedure as firma, proname from pg_proc where pronamespace='public'::regnamespace and proname in
 ('cine_rol','cine_catalogo','cine_guardar_pelicula','cine_guardar_sala','cine_crear_funcion','cine_disponibilidad','cine_comprobante','cine_reservar','cine_confirmar_reserva','cine_validar_entrada') loop
 execute format('revoke all on function %s from public, anon, authenticated',f.firma);
 execute format('grant execute on function %s to authenticated',f.firma);
 if f.proname in ('cine_rol','cine_catalogo','cine_disponibilidad','cine_comprobante','cine_reservar') then execute format('grant execute on function %s to anon',f.firma); end if;
 end loop;
end $$;
commit;
