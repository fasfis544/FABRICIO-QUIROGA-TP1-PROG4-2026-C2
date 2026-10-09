-- Activación MANUAL, UNA VEZ después de los bloques hasta 20261016000300.
-- Solo objetos nuevos/triggers; no reescribe compras, reseñas, movimientos ni avisos históricos.
-- Deshabilitado por defecto. VAPID privada y secreto del emisor permanecen en Edge/Vault.
begin;

create table public.cine_push_config (
  id boolean primary key default true check(id),
  habilitado boolean not null default false,
  origen text not null default '',
  clave_publica text not null default '',
  emisor_url text not null default ''
);
insert into public.cine_push_config(id) values(true);
create table public.cine_push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  endpoint text not null unique check(length(endpoint) between 20 and 2048),
  p256dh text not null,
  auth text not null,
  clave_publica text not null,
  activa boolean not null default true,
  revision bigint not null default 1,
  creada timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
create index cine_push_suscripciones_usuario on public.cine_push_suscripciones(usuario_id) where activa;
create table public.cine_push_eventos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  tipo text not null check(tipo in('venta','recordatorio_24','recordatorio_2','ingreso','candy')),
  clave text not null,
  pelicula_id uuid references public.peliculas(id),
  reserva_id uuid references public.cine_reservas(id),
  inicio timestamptz,
  creada timestamptz not null default now(),
  vence timestamptz not null,
  unique(usuario_id,clave)
);
create table public.cine_push_envios (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.cine_push_eventos(id),
  suscripcion_id uuid not null references public.cine_push_suscripciones(id),
  revision bigint not null,
  estado text not null default 'pendiente' check(estado in('pendiente','enviando','enviado','descartado','fallido')),
  intentos integer not null default 0 check(intentos between 0 and 6),
  proximo timestamptz not null default now(),
  lease uuid,
  lease_hasta timestamptz,
  codigo_http integer,
  finalizado_en timestamptz,
  unique(evento_id,suscripcion_id)
);
create index cine_push_envios_pendientes on public.cine_push_envios(proximo,id) where estado in('pendiente','enviando');
alter table public.cine_push_config enable row level security;
alter table public.cine_push_suscripciones enable row level security;
alter table public.cine_push_eventos enable row level security;
alter table public.cine_push_envios enable row level security;
revoke all on public.cine_push_config,public.cine_push_suscripciones,public.cine_push_eventos,public.cine_push_envios from public,anon,authenticated,service_role;

-- Whitelist de servicios Push públicos: evita convertir al emisor en un proxy SSRF.
create function public.cine_push_endpoint_valido(p_endpoint text) returns boolean
language sql immutable set search_path='' as $$
  select p_endpoint is not null and length(p_endpoint) between 20 and 2048
    and p_endpoint !~ '[[:space:]#]' and (
      p_endpoint ~ '^https://fcm\.googleapis\.com/fcm/send/[A-Za-z0-9_:%./?=&+~-]+$'
      or p_endpoint ~ '^https://updates\.push\.services\.mozilla\.com/wpush/v[12]/[A-Za-z0-9_:%./?=&+~-]+$'
      or p_endpoint ~ '^https://web\.push\.apple\.com/[A-Za-z0-9_:%./?=&+~-]+$'
      or p_endpoint ~ '^https://[a-z0-9-]+\.notify\.windows\.com/[A-Za-z0-9_:%./?=&+~-]+$'
    );
$$;
create function public.cine_push_configurar(p_origen text,p_clave text,p_emisor text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_origen is null or p_origen !~ '^https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?$'
    or p_clave is null or p_clave !~ '^B[A-Za-z0-9_-]{86}$'
    or p_emisor is null or p_emisor !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/enviar-push$' then
    raise exception 'Origen HTTPS, clave VAPID pública o URL del emisor inválidos';end if;
  if exists(select 1 from public.cine_push_config where clave_publica<>'' and clave_publica<>p_clave)
    and exists(select 1 from public.cine_push_suscripciones where activa) then
    raise exception 'Hay dispositivos activos: planificá la rotación VAPID sin invalidarlos silenciosamente';end if;
  update public.cine_push_config set origen=p_origen,clave_publica=p_clave,emisor_url=p_emisor,habilitado=true where id;
end $$;
create function public.cine_push_configuracion() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
  return (select jsonb_build_object('habilitado',habilitado,'clave_publica',case when habilitado then clave_publica else '' end,'origen',origen) from public.cine_push_config where id);
end $$;
create function public.cine_push_estado(p_endpoint text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
  return exists(select 1 from public.cine_push_suscripciones s join public.cine_push_config c on c.id
    where s.usuario_id=auth.uid() and s.endpoint=p_endpoint and s.activa and c.habilitado and s.clave_publica=c.clave_publica);
end $$;
create function public.cine_push_suscribir(p_usuario uuid,p_endpoint text,p_p256dh text,p_auth text,p_clave text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.cine_push_suscripciones;v_clave text;
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) or p_usuario is distinct from auth.uid() then raise exception 'Acceso denegado';end if;
  select clave_publica into v_clave from public.cine_push_config where id and habilitado;
  if v_clave is null or p_clave is distinct from v_clave then raise exception 'Web Push no configurado o clave desactualizada';end if;
  if not public.cine_push_endpoint_valido(p_endpoint) or p_p256dh is null or p_p256dh !~ '^B[A-Za-z0-9_-]{86}$'
    or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Suscripción inválida';end if;
  -- Serializa límite por cuenta y traspaso consentido de este dispositivo entre cuentas.
  perform pg_advisory_xact_lock(hashtextextended('push-cuenta:'||p_usuario::text,0));
  perform pg_advisory_xact_lock(hashtextextended('push-endpoint:'||p_endpoint,0));
  select * into s from public.cine_push_suscripciones where endpoint=p_endpoint for update;
  if found and (s.p256dh<>p_p256dh or s.auth<>p_auth) then raise exception 'Claves del dispositivo no coinciden';end if;
  if (s.id is null or s.usuario_id<>p_usuario or not s.activa) and
    (select count(*) from public.cine_push_suscripciones where usuario_id=p_usuario and activa)>=10 then
    raise exception 'Máximo diez dispositivos por cuenta';end if;
  if s.id is null then
    insert into public.cine_push_suscripciones(usuario_id,endpoint,p256dh,auth,clave_publica) values(p_usuario,p_endpoint,p_p256dh,p_auth,p_clave);
  elsif s.usuario_id<>p_usuario or not s.activa or s.clave_publica<>p_clave then
    update public.cine_push_envios set estado='descartado',lease=null,lease_hasta=null,finalizado_en=clock_timestamp()
      where suscripcion_id=s.id and estado in('pendiente','enviando');
    update public.cine_push_suscripciones set usuario_id=p_usuario,activa=true,clave_publica=p_clave,revision=revision+1,actualizada_en=clock_timestamp() where id=s.id;
  end if;
end $$;
create function public.cine_push_desuscribir(p_usuario uuid,p_endpoint text) returns void
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  -- La baja propia también está permitida a una cuenta Auth cuyo perfil fue desactivado.
  if auth.uid() is null or p_usuario is distinct from auth.uid() then raise exception 'Acceso denegado';end if;
  update public.cine_push_suscripciones set activa=false,revision=revision+1,actualizada_en=clock_timestamp()
    where usuario_id=auth.uid() and endpoint=p_endpoint and activa returning id into v_id;
  update public.cine_push_envios set estado='descartado',lease=null,lease_hasta=null,finalizado_en=clock_timestamp()
    where suscripcion_id=v_id and estado in('pendiente','enviando');
end $$;

-- Outbox transaccional, sin payloads personales ni secretos de comprobante.
create function public.cine_push_encolar(p_usuario uuid,p_tipo text,p_clave text,p_pelicula uuid,p_reserva uuid,p_inicio timestamptz,p_vence timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_usuario is null or not exists(select 1 from public.perfiles where id=p_usuario and activo)
    or not exists(select 1 from public.cine_push_suscripciones s join public.cine_push_config c on c.id
      where s.usuario_id=p_usuario and s.activa and c.habilitado and s.clave_publica=c.clave_publica) then return;end if;
  insert into public.cine_push_eventos(usuario_id,tipo,clave,pelicula_id,reserva_id,inicio,vence)
    values(p_usuario,p_tipo,p_clave,p_pelicula,p_reserva,p_inicio,p_vence)
    on conflict(usuario_id,clave) do nothing returning id into v_id;
  if v_id is null then return;end if;
  insert into public.cine_push_envios(evento_id,suscripcion_id,revision)
    select v_id,s.id,s.revision from public.cine_push_suscripciones s join public.cine_push_config c on c.id
      where s.usuario_id=p_usuario and s.activa and s.clave_publica=c.clave_publica;
end $$;
create function public.cine_push_venta() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_pelicula uuid;
begin
  if new.clave ~ '^venta:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_pelicula:=substring(new.clave from 7)::uuid;
    if public.cine_venta_habilitada(v_pelicula,clock_timestamp()) then
      perform public.cine_push_encolar(new.usuario_id,'venta',new.clave,v_pelicula,null,null,clock_timestamp()+interval '1 day');end if;
  end if;
  return null;
end $$;
create trigger cine_push_venta after insert on public.cine_notificaciones for each row execute function public.cine_push_venta();
create function public.cine_push_prestacion() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;v_tipo text;
begin
  if tg_table_name='cine_entradas' then
    select * into r from public.cine_reservas where id=new.reserva_id;v_tipo:='ingreso';
  else r:=new;v_tipo:='candy';end if;
  if r.estado='confirmada' then
    perform public.cine_push_encolar(r.usuario_id,v_tipo,v_tipo||':'||r.id::text,null,r.id,null,clock_timestamp()+interval '15 minutes');end if;
  return null;
end $$;
create trigger cine_push_ingreso after update of usada_en on public.cine_entradas for each row
  when(old.usada_en is null and new.usada_en is not null) execute function public.cine_push_prestacion();
create trigger cine_push_candy after update of candy_usada_en on public.cine_reservas for each row
  when(old.candy_usada_en is null and new.candy_usada_en is not null) execute function public.cine_push_prestacion();

create function public.cine_push_recordatorios(p_ahora timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare x record;
begin
  if p_ahora is null or not isfinite(p_ahora) then raise exception 'Fecha inválida';end if;
  for x in select r.id,r.usuario_id,f.inicio,v.horas from public.cine_reservas r
    join public.cine_funciones f on f.id=r.funcion_id join public.perfiles p on p.id=r.usuario_id
    cross join (values(24),(2)) v(horas)
    where r.estado='confirmada' and f.activa and p.activo and f.inicio>p_ahora
      and f.inicio-v.horas*interval '1 hour'<=p_ahora
      and f.inicio-v.horas*interval '1 hour'+interval '15 minutes'>p_ahora
      and exists(select 1 from public.cine_entradas e where e.reserva_id=r.id and e.activa and e.usada_en is null)
      -- No enviar un recordatorio cuya hora ya había pasado antes de la compra.
      and r.creada<=f.inicio-v.horas*interval '1 hour'
      and exists(select 1 from public.cine_push_suscripciones s where s.usuario_id=r.usuario_id and s.activa)
  loop
    perform public.cine_push_encolar(x.usuario_id,'recordatorio_'||x.horas,
      'recordatorio:'||x.id::text||':'||x.horas||':'||extract(epoch from x.inicio)::text,
      null,x.id,x.inicio,x.inicio-x.horas*interval '1 hour'+interval '15 minutes');
  end loop;
end $$;

create function public.cine_push_vigente(p_evento uuid,p_ahora timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.cine_push_eventos e join public.perfiles p on p.id=e.usuario_id
    where e.id=p_evento and p.activo and e.vence>p_ahora and (
      (e.tipo='venta' and exists(select 1 from public.cine_alertas where usuario_id=e.usuario_id and pelicula_id=e.pelicula_id)
        and public.cine_venta_habilitada(e.pelicula_id,p_ahora))
      or (e.tipo in('recordatorio_24','recordatorio_2')
        and p_ahora>=e.inicio-case when e.tipo='recordatorio_24' then interval '24 hours' else interval '2 hours' end
        and exists(select 1 from public.cine_reservas r
        join public.cine_funciones f on f.id=r.funcion_id where r.id=e.reserva_id and r.usuario_id=e.usuario_id
          and r.estado='confirmada' and f.activa and f.inicio=e.inicio and f.inicio>p_ahora
          and exists(select 1 from public.cine_entradas where reserva_id=r.id and activa and usada_en is null)))
      or (e.tipo='ingreso' and exists(select 1 from public.cine_reservas r join public.cine_entradas en on en.reserva_id=r.id
        where r.id=e.reserva_id and r.usuario_id=e.usuario_id and r.estado='confirmada' and en.usada_en is not null))
      or (e.tipo='candy' and exists(select 1 from public.cine_reservas r where r.id=e.reserva_id and r.usuario_id=e.usuario_id
        and r.estado='confirmada' and r.candy_usada_en is not null))
    ));
$$;
create function public.cine_push_tomar_lote(p_clave text,p_limite integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_ahora timestamptz:=clock_timestamp();v_origen text;v_ids uuid[];
begin
  if p_limite is null or p_limite not between 1 and 20 then raise exception 'Lote inválido';end if;
  select origen into v_origen from public.cine_push_config where id and habilitado and clave_publica=p_clave;
  if v_origen is null then raise exception 'Configuración Push deshabilitada o VAPID no coincide';end if;
  perform public.cine_push_recordatorios(v_ahora);
  update public.cine_push_envios j set estado='descartado',lease=null,lease_hasta=null,finalizado_en=v_ahora
    from public.cine_push_eventos e,public.cine_push_suscripciones s
    where j.evento_id=e.id and j.suscripcion_id=s.id and j.estado in('pendiente','enviando')
      and (not s.activa or s.usuario_id<>e.usuario_id or j.revision<>s.revision or s.clave_publica<>p_clave or not public.cine_push_vigente(e.id,v_ahora));
  update public.cine_push_envios set estado='fallido',lease=null,lease_hasta=null,finalizado_en=v_ahora
    where intentos>=6 and (estado='pendiente' or (estado='enviando' and lease_hasta<=v_ahora));
  select array_agg(id) into v_ids from (
    select id from public.cine_push_envios where intentos<6 and proximo<=v_ahora
      and (estado='pendiente' or (estado='enviando' and lease_hasta<=v_ahora))
      order by proximo,id limit p_limite for update skip locked
  ) t;
  update public.cine_push_envios set estado='enviando',intentos=intentos+1,lease=gen_random_uuid(),lease_hasta=v_ahora+interval '2 minutes'
    where id=any(v_ids);
  return coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'tipo',e.tipo,
    'pelicula_id',e.pelicula_id,'vence',e.vence,'origen',v_origen,
    'suscripcion',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))))
    from public.cine_push_envios j join public.cine_push_eventos e on e.id=j.evento_id
    join public.cine_push_suscripciones s on s.id=j.suscripcion_id where j.id=any(v_ids)),'[]'::jsonb);
end $$;
create function public.cine_push_autorizar_envio(p_id uuid,p_lease uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.cine_push_envios j join public.cine_push_eventos e on e.id=j.evento_id
    join public.cine_push_suscripciones s on s.id=j.suscripcion_id join public.cine_push_config c on c.id
    where j.id=p_id and j.lease=p_lease and j.estado='enviando' and j.lease_hasta>clock_timestamp()
      and s.activa and s.usuario_id=e.usuario_id and s.revision=j.revision and c.habilitado
      and c.clave_publica=s.clave_publica and public.cine_push_vigente(e.id,clock_timestamp()));
$$;
create function public.cine_push_finalizar(p_id uuid,p_lease uuid,p_resultado text,p_http integer default null,p_espera integer default 0) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.cine_push_envios;v_ahora timestamptz:=clock_timestamp();
begin
  if p_resultado is null or p_resultado not in('enviado','expirada','reintento','fallo','descartado')
    or p_espera is null or p_espera not between 0 and 86400 then raise exception 'Resultado inválido';end if;
  -- Mismo orden que alta/baja: dispositivo antes de sus entregas, evita deadlocks con 410.
  perform 1 from public.cine_push_suscripciones where id=(select suscripcion_id from public.cine_push_envios where id=p_id) for update;
  select * into j from public.cine_push_envios where id=p_id for update;
  if not found or j.estado<>'enviando' or j.lease is distinct from p_lease or j.lease_hasta<=v_ahora then return false;end if;
  if p_resultado='expirada' then
    update public.cine_push_suscripciones set activa=false,revision=revision+1,actualizada_en=v_ahora
      where id=j.suscripcion_id and revision=j.revision;
    update public.cine_push_envios set estado='descartado',lease=null,lease_hasta=null,finalizado_en=v_ahora
      where suscripcion_id=j.suscripcion_id and estado in('pendiente','enviando') and id<>j.id;
  end if;
  update public.cine_push_envios set
    estado=case when p_resultado='enviado' then 'enviado' when p_resultado in('expirada','descartado') then 'descartado'
      when p_resultado='reintento' and intentos<6 then 'pendiente' else 'fallido' end,
    proximo=case when p_resultado='reintento' then v_ahora+greatest(p_espera,30*power(2,j.intentos-1)::integer)*interval '1 second' else proximo end,
    codigo_http=p_http,lease=null,lease_hasta=null,
    finalizado_en=case when p_resultado='reintento' and intentos<6 then null else v_ahora end
    where id=j.id;
  return true;
end $$;

-- Grants explícitos: nada de endpoints/keys por SELECT, ni escritura directa/TRUNCATE.
do $$ declare f record;begin
  for f in select oid::regprocedure firma,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'cine_push_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.firma);
    if f.proname in('cine_push_configuracion','cine_push_estado','cine_push_suscribir','cine_push_desuscribir') then
      execute format('grant execute on function %s to authenticated',f.firma);end if;
    if f.proname in('cine_push_configurar','cine_push_recordatorios','cine_push_tomar_lote','cine_push_autorizar_envio','cine_push_finalizar') then
      execute format('grant execute on function %s to service_role',f.firma);end if;
  end loop;
end $$;
commit;
