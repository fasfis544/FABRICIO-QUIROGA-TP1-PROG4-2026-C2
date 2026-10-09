-- Aplicar UNA VEZ después de 20261009000100_alineacion_documento.sql.
-- No recrea tablas históricas ni convierte activo/activa o accion/operacion.
begin;

create or replace function public.cine_consultar_auditoria(p_desde timestamptz,p_hasta timestamptz,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_desde is null or p_hasta is null or p_hasta<=p_desde or p_offset is null or p_offset<0 then raise exception 'Hasta debe ser posterior a Desde';end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.creada desc,t.id desc) from (
  select * from (
   select 'cine:'||id::text id,tabla,operacion,usuario_id,creada from public.cine_auditoria
   union all
   select 'catalogo:'||e.id::text,e.tabla,coalesce(to_jsonb(e)->>'operacion',to_jsonb(e)->>'accion'),e.usuario_id,e.created_at from public.eventos_auditoria e
  ) a where creada>=p_desde and creada<p_hasta order by creada desc,id desc limit 100 offset p_offset
 ) t),'[]');
end $$;

-- Permite conservar asociaciones inactivas existentes, nunca asociarlas a una nueva película.
create or replace function public.cine_guardar_pelicula(p_datos jsonb,p_generos uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.peliculas;v uuid;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_mutex for update;
 select * into r from jsonb_populate_record(null::public.peliculas,p_datos);
 if r.id is not null then perform 1 from public.peliculas where id=r.id for update;if not found then raise exception 'Película inexistente';end if;end if;
 if nullif(trim(r.titulo),'') is null or length(trim(r.titulo))>150 or r.slug is null or r.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or r.duracion_minutos is null or r.duracion_minutos not between 1 and 600 or r.fecha_estreno is null then raise exception 'Revisá título, slug, duración y fecha';end if;
 if r.clasificacion is null or r.clasificacion::text not in('ATP','13','18') then raise exception 'Clasificación permitida: ATP, 13 o 18';end if;
 if nullif(trim(r.sinopsis),'') is null or nullif(trim(r.poster_url),'') is null then raise exception 'Sinopsis y afiche obligatorios';end if;
 if r.idioma is null or r.idioma not in('castellano','subtitulada') or r.formato is null or r.formato not in('2D','3D','4D','5D') then raise exception 'Revisá idioma y formato';end if;
 if coalesce(cardinality(p_generos),0)<1 then raise exception 'Asociá al menos un género';end if;
 if exists(select 1 from unnest(p_generos) x where not exists(select 1 from public.generos g where g.id=x and (
  coalesce((to_jsonb(g)->>'activo')::boolean,(to_jsonb(g)->>'activa')::boolean,false)
  or exists(select 1 from public.peliculas_generos pg where pg.pelicula_id=r.id and pg.genero_id=g.id)))) then raise exception 'Seleccioná géneros activos; solo se conservan inactivos ya asociados';end if;
 if r.id is null then
  insert into public.peliculas(titulo,slug,sinopsis,duracion_minutos,clasificacion,fecha_estreno,poster_url,activa,idioma,formato,precio_preventa)
  values(trim(r.titulo),r.slug,trim(r.sinopsis),r.duracion_minutos,r.clasificacion,r.fecha_estreno,r.poster_url,coalesce(r.activa,true),r.idioma,r.formato,r.precio_preventa) returning id into v;
 else
  update public.peliculas set titulo=trim(r.titulo),slug=r.slug,sinopsis=trim(r.sinopsis),duracion_minutos=r.duracion_minutos,clasificacion=r.clasificacion,fecha_estreno=r.fecha_estreno,poster_url=r.poster_url,activa=coalesce(r.activa,true),idioma=r.idioma,formato=r.formato,precio_preventa=r.precio_preventa where id=r.id returning id into v;
 end if;
 delete from public.peliculas_generos where pelicula_id=v;
 insert into public.peliculas_generos(pelicula_id,genero_id) select v,x from (select distinct unnest(p_generos) x) t;
 return v;
end $$;

-- Todas las altas (individuales o por lote) toman salas en el mismo orden que reprogramar.
create or replace function public.cine_crear_funcion(p_pelicula uuid,p_sala uuid,p_inicio timestamptz,p_precio numeric,p_idioma text default null,p_formato text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.cine_salas;v uuid;dur integer;v_fin timestamptz;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_salas order by id for update;
 if p_inicio is null or p_inicio<=clock_timestamp() or p_precio is null or p_precio<=0 or p_idioma is null or p_idioma not in('castellano','subtitulada') or p_formato is null or p_formato not in('2D','3D','4D','5D') then raise exception 'Datos de función inválidos';end if;
 select duracion_minutos into dur from public.peliculas where id=p_pelicula and activa and fecha_estreno<=(p_inicio at time zone 'America/Argentina/Buenos_Aires')::date;
 if not found then raise exception 'Película no disponible para esa fecha';end if;
 v_fin:=p_inicio+(dur+30)*interval '1 minute';
 for s in select * from public.cine_salas where activa and distribucion_documento order by nombre,id loop
  if not exists(select 1 from public.cine_funciones where sala_id=s.id and activa and inicio<v_fin and fin>p_inicio) then
   insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio,idioma,formato) values(p_pelicula,s.id,p_inicio,v_fin,p_precio,p_idioma,p_formato) returning id into v;return v;
  end if;
 end loop;
 raise exception 'No hay una sala adaptada disponible en ese horario';
end $$;

create function public.cine_reprogramar_funcion(p_id uuid,p_inicio timestamptz,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare f public.cine_funciones;s public.cine_salas;dur integer;v_fin timestamptz;v_sala uuid;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_inicio is null or p_inicio<=clock_timestamp() or p_motivo is null or length(trim(p_motivo)) not between 5 and 500 then raise exception 'Ingresá fecha futura y motivo de 5–500 caracteres';end if;
 -- Orden uniforme con programación: salas, función, mutex económico.
 perform 1 from public.cine_salas order by id for update;
 select * into f from public.cine_funciones where id=p_id for update;
 if not found or not f.activa or f.inicio<=clock_timestamp() then raise exception 'Función futura activa inexistente';end if;
 perform 1 from public.cine_mutex for update;
 if f.inicio<=clock_timestamp() or p_inicio<=clock_timestamp() then raise exception 'La función y el nuevo inicio deben ser futuros';end if;
 if exists(select 1 from public.cine_reservas where funcion_id=f.id and (estado='confirmada' or (estado='pendiente' and vence>clock_timestamp()))) then raise exception 'No se puede reprogramar con compras o reservas vigentes; los PDF/QR conservarían un horario incorrecto';end if;
 select duracion_minutos into dur from public.peliculas where id=f.pelicula_id and activa and fecha_estreno<=(p_inicio at time zone 'America/Argentina/Buenos_Aires')::date;
 if not found then raise exception 'Película no disponible para esa fecha';end if;
 v_fin:=p_inicio+(dur+30)*interval '1 minute';
 for s in select * from public.cine_salas where activa and distribucion_documento order by (id=f.sala_id) desc,nombre,id loop
  if not exists(select 1 from public.cine_funciones where id<>f.id and sala_id=s.id and activa and inicio<v_fin and fin>p_inicio) then v_sala:=s.id;exit;end if;
 end loop;
 if v_sala is null then raise exception 'No hay una sala adaptada disponible en ese horario';end if;
 update public.cine_funciones set sala_id=v_sala,inicio=p_inicio,fin=v_fin where id=f.id;
 insert into public.cine_auditoria(tabla,operacion,usuario_id,registro) values('cine_funciones','REPROGRAMAR',auth.uid(),jsonb_build_object('id',f.id,'motivo',trim(p_motivo),'inicio_anterior',f.inicio,'inicio',p_inicio,'sala_id',v_sala));
end $$;

create function public.cine_cancelar_funcion(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare f public.cine_funciones;r public.cine_reservas;x jsonb;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_motivo is null or length(trim(p_motivo)) not between 5 and 500 then raise exception 'Indicá un motivo de 5–500 caracteres';end if;
 select * into f from public.cine_funciones where id=p_id for update;
 if not found then raise exception 'Función inexistente';end if;
 if not f.activa then return;end if;
 if f.inicio<=clock_timestamp() then raise exception 'No se puede cancelar una función iniciada';end if;
 perform 1 from public.cine_mutex for update;
 if f.inicio<=clock_timestamp() then raise exception 'No se puede cancelar una función iniciada';end if;
 -- Fallar antes de cualquier escritura evita compensaciones parciales y borrar historia.
 if exists(select 1 from public.cine_reservas where funcion_id=f.id and estado='confirmada' and usuario_id is null) then raise exception 'Hay compras invitadas: se requiere resolver su compensación antes de cancelar';end if;
 if exists(select 1 from public.cine_reservas reserva where reserva.funcion_id=f.id and reserva.estado='confirmada' and (reserva.candy_usada_en is not null or exists(select 1 from public.cine_entradas e where e.reserva_id=reserva.id and e.usada_en is not null))) then raise exception 'No se puede cancelar con prestaciones ya utilizadas';end if;
 for r in select * from public.cine_reservas where funcion_id=f.id and (estado='confirmada' or (estado='pendiente' and vence>clock_timestamp())) order by id for update loop
  if r.estado='confirmada' then
   if r.puntos>0 and (public.cine_saldos(r.usuario_id)->>'puntos')::numeric<r.puntos then raise exception 'Hay puntos ya utilizados: se requiere resolver la compensación';end if;
   insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(r.usuario_id,'credito',r.total,'Cancelación de función',r.id);
   if r.puntos>0 then insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(r.usuario_id,'puntos',-r.puntos,'Cancelación de función',r.id);end if;
   for x in select value from jsonb_array_elements(r.stock_items) loop update public.cine_productos set stock=stock+(x->>'cantidad')::integer where id=(x->>'id')::uuid;end loop;
  end if;
  update public.cine_reservas set estado='cancelada' where id=r.id;
  update public.cine_entradas set activa=false where reserva_id=r.id;
  if r.usuario_id is not null then insert into public.cine_notificaciones(usuario_id,mensaje) values(r.usuario_id,'Función cancelada por el cine: '||trim(p_motivo)||'. Las compras confirmadas se convierten en crédito, sin devolución monetaria.');end if;
 end loop;
 update public.cine_funciones set activa=false where id=f.id;
 insert into public.cine_auditoria(tabla,operacion,usuario_id,registro) values('cine_funciones','CANCELAR',auth.uid(),jsonb_build_object('id',f.id,'motivo',trim(p_motivo)));
end $$;

create table public.cine_programaciones(solicitud uuid primary key,usuario_id uuid not null references auth.users(id),pedido jsonb not null,funciones jsonb not null,creada timestamptz not null default now());
alter table public.cine_programaciones enable row level security;
revoke all on public.cine_programaciones from public,anon,authenticated;
create function public.cine_programar_funciones(p_pelicula uuid,p_desde date,p_hasta date,p_hora time,p_dias integer[],p_precio numeric,p_idioma text,p_formato text,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date;v uuid;ids jsonb:='[]';pedido jsonb;prev public.cine_programaciones;dias integer[];
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_solicitud is null or p_desde is null or p_hasta is null or p_hora is null or p_hasta<p_desde or p_hasta-p_desde>89 or coalesce(cardinality(p_dias),0)<1 or exists(select 1 from unnest(p_dias) x where x is null or x not between 1 and 7) then raise exception 'Indicá un rango de hasta 90 días, horario y días de semana válidos';end if;
 select array_agg(distinct x order by x) into dias from unnest(p_dias) x;
 pedido:=jsonb_build_object('pelicula',p_pelicula,'desde',p_desde,'hasta',p_hasta,'hora',p_hora,'dias',dias,'precio',p_precio,'idioma',p_idioma,'formato',p_formato);
 perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
 select * into prev from public.cine_programaciones where solicitud=p_solicitud;
 if found then if prev.usuario_id<>auth.uid() or prev.pedido is distinct from pedido then raise exception 'Solicitud ya utilizada para otra programación';end if;return prev.funciones;end if;
 perform 1 from public.cine_salas order by id for update;
 for d in select (p_desde+n)::date from generate_series(0,p_hasta-p_desde) n where extract(isodow from p_desde+n)::integer=any(dias) loop
  begin
   v:=public.cine_crear_funcion(p_pelicula,null,(d+p_hora) at time zone 'America/Argentina/Buenos_Aires',p_precio,p_idioma,p_formato);
  exception when others then raise exception 'No se guardó el lote. Fecha %: %',d,sqlerrm;
  end;
  ids:=ids||jsonb_build_array(v);
 end loop;
 if jsonb_array_length(ids)=0 then raise exception 'No hay fechas que coincidan con los días elegidos';end if;
 insert into public.cine_programaciones(solicitud,usuario_id,pedido,funciones) values(p_solicitud,auth.uid(),pedido,ids);
 return ids;
end $$;

create function public.cine_usuarios_admin(p_busqueda text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_offset is null or p_offset<0 or length(coalesce(p_busqueda,''))>100 then raise exception 'Búsqueda inválida';end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.nombre,t.id) from (
  select p.id,coalesce(p.nombre,'') nombre,coalesce(p.apellido,'') apellido,coalesce(u.email,'') email,p.rol::text rol,p.activo
  from public.perfiles p join auth.users u on u.id=p.id
  where coalesce(p_busqueda,'')='' or position(lower(trim(p_busqueda)) in lower(concat_ws(' ',p.nombre,p.apellido,u.email)))>0
  order by nombre,p.id limit 50 offset p_offset
 ) t),'[]');
end $$;
create function public.cine_administrar_usuario(p_id uuid,p_rol text,p_activo boolean) returns void
language plpgsql security definer set search_path='' as $$
declare anterior jsonb;
begin
 -- Serializa cambios de administradores y revalida al actor tras esperar.
 perform pg_advisory_xact_lock(6101001);
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_rol is null or p_rol not in('cliente','empleado','administrador') or p_activo is null then raise exception 'Rol o estado inválido';end if;
 if p_id=auth.uid() and (p_rol<>'administrador' or not p_activo) then raise exception 'No podés quitarte tu propio acceso administrativo';end if;
 select jsonb_build_object('rol',rol,'activo',activo) into anterior from public.perfiles where id=p_id for update;
 if not found then raise exception 'Usuario inexistente';end if;
 -- jsonb_populate_record respeta tanto enum como text del esquema existente.
 update public.perfiles set rol=(jsonb_populate_record(null::public.perfiles,jsonb_build_object('rol',p_rol))).rol,activo=p_activo where id=p_id;
 insert into public.cine_auditoria(tabla,operacion,usuario_id,registro) values('perfiles','CAMBIAR_ACCESO',auth.uid(),jsonb_build_object('id',p_id,'anterior',anterior,'rol',p_rol,'activo',p_activo));
end $$;
-- Evita una segunda puerta de escritura de roles sin la serialización/auditoría nuevas.
do $$ declare f record;begin
 for f in select oid::regprocedure firma from pg_proc where pronamespace='public'::regnamespace and proname='administrar_perfil' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.firma);
 end loop;
end $$;

create function public.cine_reportes_admin(p_desde timestamptz,p_hasta timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ventas jsonb;diarios jsonb;peliculas jsonb;candy jsonb;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_desde is null or p_hasta is null or p_hasta<=p_desde or p_hasta-p_desde>interval '366 days' then raise exception 'Indicá un período válido de hasta 366 días';end if;
 select jsonb_build_object('compras',count(*),'total',coalesce(sum(total),0),'credito',coalesce(sum(credito),0),'abonado',coalesce(sum(total-credito),0),'entradas',coalesce(sum((select count(*) from public.cine_entradas e where e.reserva_id=r.id and e.activa)),0)) into ventas
 from public.cine_reservas r where estado='confirmada' and creada>=p_desde and creada<p_hasta;
 select coalesce(jsonb_agg(to_jsonb(t) order by nombre),'[]') into diarios from (
  select to_char(r.creada at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') nombre,sum((select count(*) from public.cine_entradas e where e.reserva_id=r.id and e.activa)) cantidad,sum(r.total) importe,0 vistas
  from public.cine_reservas r where estado='confirmada' and creada>=p_desde and creada<p_hasta group by 1
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t) order by vistas desc,cantidad desc,nombre),'[]') into peliculas from (
  select p.titulo nombre,count(*) filter(where r.creada>=p_desde and r.creada<p_hasta) cantidad,coalesce(sum(e.precio) filter(where r.creada>=p_desde and r.creada<p_hasta),0) importe,count(*) filter(where e.usada_en>=p_desde and e.usada_en<p_hasta) vistas
  from public.cine_entradas e join public.cine_reservas r on r.id=e.reserva_id join public.cine_funciones f on f.id=e.funcion_id join public.peliculas p on p.id=f.pelicula_id
  where r.estado='confirmada' and e.activa and ((r.creada>=p_desde and r.creada<p_hasta) or (e.usada_en>=p_desde and e.usada_en<p_hasta)) group by p.id,p.titulo
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t) order by cantidad desc,nombre),'[]') into candy from (
  select p.nombre,sum((x->>'cantidad')::integer) cantidad,0 importe,0 vistas
  from public.cine_reservas r cross join lateral jsonb_array_elements(r.stock_items) x join public.cine_productos p on p.id=(x->>'id')::uuid
  where r.estado='confirmada' and r.creada>=p_desde and r.creada<p_hasta group by p.id,p.nombre
 ) t;
 return ventas||jsonb_build_object('diarios',diarios,'peliculas',peliculas,'candy',candy);
end $$;

-- Sin cambios a grants de tablas privadas. Solo RPC verificadas en el servidor.
do $$ declare f record;begin
 for f in select oid::regprocedure firma from pg_proc where pronamespace='public'::regnamespace and proname in('cine_consultar_auditoria','cine_guardar_pelicula','cine_crear_funcion','cine_reprogramar_funcion','cine_cancelar_funcion','cine_programar_funciones','cine_usuarios_admin','cine_administrar_usuario','cine_reportes_admin') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.firma);
  execute format('grant execute on function %s to authenticated',f.firma);
 end loop;
end $$;
commit;
