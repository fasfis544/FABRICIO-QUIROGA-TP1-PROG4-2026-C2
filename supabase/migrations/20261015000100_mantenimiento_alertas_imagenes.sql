-- Aplicar UNA VEZ después de los bloques anteriores, incluido 20261014000200.
-- No borra historial, no recalcula puntos ni cambia el plano normativo.
begin;

create table public.cine_butacas_mantenimiento (
  sala_id uuid not null references public.cine_salas(id),
  codigo text not null,
  bloqueada boolean not null,
  motivo text not null check(length(trim(motivo)) between 5 and 500),
  actualizada_en timestamptz not null default now(),
  actualizada_por uuid not null references auth.users(id),
  primary key(sala_id,codigo)
);
alter table public.cine_butacas_mantenimiento enable row level security;
revoke all on public.cine_butacas_mantenimiento from public,anon,authenticated;

create function public.cine_butacas_admin(p_sala uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.cine_salas;
begin
  if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
  select * into s from public.cine_salas where id=p_sala;
  if not found then raise exception 'Sala inexistente';end if;
  return jsonb_build_object('sala',to_jsonb(s),'butacas',(
    select jsonb_agg(to_jsonb(b)||jsonb_build_object(
      'bloqueada',coalesce(m.bloqueada,false),'motivo',coalesce(m.motivo,''),
      'protegida',exists(select 1 from public.cine_funciones f
        join public.cine_entradas e on e.funcion_id=f.id
        join public.cine_reservas r on r.id=e.reserva_id
        where f.sala_id=s.id and f.fin>now() and e.butaca=b.codigo and e.activa
          and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>now()))))
      order by b.fila,b.columna)
    from public.cine_butacas(s.id) b left join public.cine_butacas_mantenimiento m
      on m.sala_id=s.id and m.codigo=b.codigo));
end $$;

create function public.cine_mantener_butacas(p_sala uuid,p_codigos text[],p_bloqueada boolean,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.cine_salas;v_ahora timestamptz;
begin
  if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
  -- Mismo orden que programación: sala, funciones, mutex. Compra mantiene función+mutex.
  select * into s from public.cine_salas where id=p_sala for update;
  if not found then raise exception 'Sala inexistente';end if;
  if not s.distribucion_documento then raise exception 'Adaptá primero la sala al plano del Word';end if;
  perform 1 from public.cine_funciones where sala_id=p_sala order by id for update;
  perform 1 from public.cine_mutex for update;
  v_ahora:=clock_timestamp();
  if p_bloqueada is null or p_motivo is null or length(trim(p_motivo)) not between 5 and 500 then
    raise exception 'Indicá un motivo de 5 a 500 caracteres';end if;
  if p_codigos is null or cardinality(p_codigos) not between 1 and 532
    or cardinality(p_codigos)<>(select count(distinct x) from unnest(p_codigos) x)
    or exists(select 1 from unnest(p_codigos) x where x is null or not exists(
      select 1 from public.cine_butacas(p_sala) b where b.codigo=x)) then
    raise exception 'Seleccioná butacas válidas sin duplicados';end if;
  if p_bloqueada and exists(select 1 from public.cine_funciones f
    join public.cine_entradas e on e.funcion_id=f.id join public.cine_reservas r on r.id=e.reserva_id
    where f.sala_id=p_sala and f.fin>v_ahora and e.activa and e.butaca=any(p_codigos)
      and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>v_ahora))) then
    raise exception 'No se pueden bloquear butacas comprometidas en funciones futuras o en curso';end if;
  insert into public.cine_butacas_mantenimiento(sala_id,codigo,bloqueada,motivo,actualizada_por)
    select p_sala,x,p_bloqueada,trim(p_motivo),auth.uid() from unnest(p_codigos) x
    on conflict(sala_id,codigo) do update set bloqueada=excluded.bloqueada,motivo=excluded.motivo,
      actualizada_en=clock_timestamp(),actualizada_por=excluded.actualizada_por;
  insert into public.cine_auditoria(tabla,operacion,usuario_id,registro)
    values('cine_butacas_mantenimiento',case when p_bloqueada then 'BLOQUEAR' else 'RESTAURAR' end,
      auth.uid(),jsonb_build_object('sala_id',p_sala,'butacas',p_codigos,'motivo',trim(p_motivo)));
  insert into public.cine_eventos_publicos(id,funcion_id)
    select f.id::text,f.id from public.cine_funciones f where f.sala_id=p_sala and f.activa and f.fin>v_ahora
    on conflict(id) do update set revision=public.cine_eventos_publicos.revision+1;
end $$;

alter function public.cine_calcular_checkout(uuid,text[],jsonb,text,numeric) rename to cine_calcular_checkout_mantenimiento_base;
revoke all on function public.cine_calcular_checkout_mantenimiento_base(uuid,text[],jsonb,text,numeric) from public,anon,authenticated,service_role;
create function public.cine_calcular_checkout(p_funcion uuid,p_butacas text[],p_candy jsonb,p_cupon text,p_credito numeric) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if exists(select 1 from public.cine_butacas_mantenimiento m join public.cine_funciones f on f.sala_id=m.sala_id
    where f.id=p_funcion and m.bloqueada and m.codigo=any(p_butacas)) then
    raise exception 'Una butaca está bloqueada por mantenimiento. Volvé al mapa';end if;
  return public.cine_calcular_checkout_mantenimiento_base(p_funcion,p_butacas,p_candy,p_cupon,p_credito);
end $$;
revoke all on function public.cine_calcular_checkout(uuid,text[],jsonb,text,numeric) from public,anon,authenticated,service_role;

alter function public.cine_disponibilidad(uuid) rename to cine_disponibilidad_mantenimiento_base;
revoke all on function public.cine_disponibilidad_mantenimiento_base(uuid) from public,anon,authenticated,service_role;
create function public.cine_disponibilidad(p_funcion uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
  v:=public.cine_disponibilidad_mantenimiento_base(p_funcion);
  return v||jsonb_build_object('bloqueadas',coalesce((select jsonb_agg(m.codigo order by m.codigo)
    from public.cine_butacas_mantenimiento m where m.sala_id=(v->'sala'->>'id')::uuid and m.bloqueada),'[]'));
end $$;
revoke all on function public.cine_disponibilidad(uuid),public.cine_butacas_admin(uuid),public.cine_mantener_butacas(uuid,text[],boolean,text) from public,anon,authenticated;
grant execute on function public.cine_disponibilidad(uuid) to anon,authenticated;
grant execute on function public.cine_butacas_admin(uuid),public.cine_mantener_butacas(uuid,text[],boolean,text) to authenticated;

-- El evento es la primera habilitación efectiva, no simplemente alta de función o estreno.
create table public.cine_eventos_venta (
  pelicula_id uuid primary key references public.peliculas(id),
  habilitada_en timestamptz not null
);
alter table public.cine_eventos_venta enable row level security;
revoke all on public.cine_eventos_venta from public,anon,authenticated;
create function public.cine_venta_habilitada(p_pelicula uuid,p_ahora timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.peliculas p join public.cine_funciones f on f.pelicula_id=p.id
    join public.cine_salas s on s.id=f.sala_id
    where p.id=p_pelicula and p.activa and p.clasificacion::text in('ATP','13','18')
      and f.activa and f.inicio>p_ahora and s.activa and s.distribucion_documento
      and f.idioma in('castellano','subtitulada') and f.formato in('2D','3D','4D','5D')
      and (p.fecha_estreno<=(p_ahora at time zone 'America/Argentina/Buenos_Aires')::date
        or (p.precio_preventa is not null and p.fecha_estreno<=(p_ahora at time zone 'America/Argentina/Buenos_Aires')::date+7))
      and exists(select 1 from public.cine_butacas(s.id) b where not exists(
        select 1 from public.cine_butacas_mantenimiento m where m.sala_id=s.id and m.codigo=b.codigo and m.bloqueada)
        and not exists(select 1 from public.cine_entradas e join public.cine_reservas r on r.id=e.reserva_id
          where e.funcion_id=f.id and e.butaca=b.codigo and e.activa
            and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>p_ahora)))))
$$;
create function public.cine_procesar_alertas_venta(p_ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_ahora is null or not isfinite(p_ahora) then raise exception 'Fecha inválida';end if;
  insert into public.cine_eventos_venta(pelicula_id,habilitada_en)
    select p.id,p_ahora from public.peliculas p where public.cine_venta_habilitada(p.id,p_ahora) order by p.id
    on conflict(pelicula_id) do nothing;
  insert into public.cine_notificaciones(usuario_id,mensaje,clave)
    select a.usuario_id,'Ya podés comprar entradas para '||p.titulo||'. Consultá sus funciones disponibles.',
      'venta:'||p.id::text
    from public.cine_alertas a join public.peliculas p on p.id=a.pelicula_id
      join public.perfiles pr on pr.id=a.usuario_id
      join public.cine_eventos_venta ev on ev.pelicula_id=p.id
    where pr.activo and public.cine_venta_habilitada(p.id,p_ahora) order by a.usuario_id,p.id
    on conflict(usuario_id,clave) do nothing;
  get diagnostics n=row_count;
  return n;
end $$;
revoke all on function public.cine_venta_habilitada(uuid,timestamptz),public.cine_procesar_alertas_venta(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.cine_procesar_alertas_venta(timestamptz) to service_role;

create or replace function public.cine_notificar_funcion() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.cine_procesar_alertas_venta();return null;end $$;
create or replace function public.cine_notificar_estreno() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.cine_procesar_alertas_venta();return null;end $$;
create trigger cine_alerta_sala after update on public.cine_salas
  for each statement execute function public.cine_notificar_estreno();
create trigger cine_alerta_mantenimiento after insert or update on public.cine_butacas_mantenimiento
  for each statement execute function public.cine_notificar_estreno();
create trigger cine_alerta_suscripcion after insert on public.cine_alertas
  for each statement execute function public.cine_notificar_estreno();

-- Retira la notificación engañosa por fecha de estreno; conserva todas las demás prestaciones.
create or replace function public.cine_mis_beneficios_anterior() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
  perform public.cine_procesar_alertas_venta();
  return public.cine_saldos(auth.uid())||jsonb_build_object(
    'movimientos',coalesce((select jsonb_agg(to_jsonb(m)-'usuario_id' order by creada desc) from public.cine_movimientos m where usuario_id=auth.uid()),'[]'),
    'recompensas',coalesce((select jsonb_agg(to_jsonb(r) order by puntos) from public.cine_recompensas r where activa and desde<=now() and hasta>now()),'[]'),
    'canjes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre,'puntos',c.puntos,'creada',c.creada,'codigo',cu.codigo,'hasta',cu.hasta,'usado',exists(select 1 from public.cine_reservas where cupon_id=cu.id and (estado='confirmada' or (estado='cancelada' and confirmada_por is not null)))) order by c.creada desc) from public.cine_canjes c join public.cine_cupones cu on cu.id=c.cupon_id where c.usuario_id=auth.uid()),'[]'),
    'notificaciones',coalesce((select jsonb_agg(to_jsonb(n)-'usuario_id' order by creada desc) from public.cine_notificaciones n where usuario_id=auth.uid()),'[]'),
    'alertas',coalesce((select jsonb_agg(jsonb_build_object('pelicula_id',a.pelicula_id,'titulo',p.titulo)) from public.cine_alertas a join public.peliculas p on p.id=a.pelicula_id where a.usuario_id=auth.uid()),'[]'));
end $$;

-- Imagen opcional para no invalidar productos existentes; se conserva la ruta, no URLs arbitrarias.
alter table public.cine_productos add column imagen_path text check(imagen_path is null or imagen_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
create function public.cine_validar_imagen_producto(p_ruta text,p_anterior text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_ruta is not null and p_ruta is distinct from p_anterior and (
    p_ruta !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    or split_part(p_ruta,'/',1) is distinct from auth.uid()::text) then
    raise exception 'Imagen de producto inválida: subí el archivo desde tu cuenta';end if;
end $$;
alter function public.cine_guardar_oferta(text,jsonb) rename to cine_guardar_oferta_imagen_base;
revoke all on function public.cine_guardar_oferta_imagen_base(text,jsonb) from public,anon,authenticated,service_role;
create function public.cine_guardar_oferta(p_tipo text,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v uuid;anterior text;ruta text;
begin
  if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
  perform 1 from public.cine_mutex for update;
  if p_tipo='producto' and p_datos ? 'imagen_path' then
    select imagen_path into anterior from public.cine_productos where id=nullif(p_datos->>'id','')::uuid;
    ruta:=nullif(p_datos->>'imagen_path','');
    perform public.cine_validar_imagen_producto(ruta,anterior);
  end if;
  v:=public.cine_guardar_oferta_imagen_base(p_tipo,p_datos);
  if p_tipo='producto' and p_datos ? 'imagen_path' then
    update public.cine_productos set imagen_path=ruta where id=v;
  end if;
  return v;
end $$;
revoke all on function public.cine_validar_imagen_producto(text,text),public.cine_guardar_oferta(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cine_guardar_oferta(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
