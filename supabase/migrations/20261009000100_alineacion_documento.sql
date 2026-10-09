-- NUEVO bloque: aplicar después de 20261008000300. No reaplicar migraciones anteriores.
-- No borra compras, códigos antiguos, perfiles ni catálogos.
begin;
do $$ declare c record;begin
 for c in select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in('peliculas','cine_funciones') and column_name in('idioma','formato') loop
 if c.data_type<>'text' then raise exception 'Compatibilidad: %.% tiene tipo %, no text. Revisar el esquema antes de aplicar, sin borrar datos',c.table_name,c.column_name,c.data_type;end if;
 end loop;
end $$;

alter table public.perfiles add column if not exists fecha_nacimiento date;
alter table public.perfiles add column if not exists grupo_sanguineo text;
alter table public.perfiles add column if not exists color_ojos text;
alter table public.perfiles add column if not exists vacaciones_anuales integer;
do $$ declare c record;begin
 for c in select column_name,data_type from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name in('fecha_nacimiento','grupo_sanguineo','color_ojos','vacaciones_anuales') loop
 if c.data_type<>(case c.column_name when 'fecha_nacimiento' then 'date' when 'vacaciones_anuales' then 'integer' else 'text' end) then raise exception 'Compatibilidad: perfiles.% tiene tipo %. Revisar sin convertir automáticamente',c.column_name,c.data_type;end if;
 end loop;
end $$;
-- No inventar fechas de nacimiento de usuarios existentes.
create function public.cine_validar_datos_perfil(p_datos jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
 if p_datos is null or nullif(trim(p_datos->>'nombre'),'') is null or length(p_datos->>'nombre')>100
 or nullif(trim(p_datos->>'apellido'),'') is null or length(p_datos->>'apellido')>100
 or (p_datos->>'fecha_nacimiento')::date is null
 or (p_datos->>'fecha_nacimiento')::date<'1900-01-01'
 or (p_datos->>'grupo_sanguineo') is null or p_datos->>'grupo_sanguineo' not in ('A+','A-','B+','B-','AB+','AB-','O+','O-')
 or nullif(trim(p_datos->>'color_ojos'),'') is null or length(p_datos->>'color_ojos')>40
 or (p_datos->>'vacaciones_anuales')::integer is null or (p_datos->>'vacaciones_anuales')::integer not between 0 and 365
 then raise exception 'Completá los datos del perfil (fecha, grupo sanguíneo, ojos y vacaciones)';end if;
end $$;
create function public.cine_completar_perfil(p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
 perform public.cine_validar_datos_perfil(p_datos);
 if (p_datos->>'fecha_nacimiento')::date>(now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'Fecha de nacimiento futura';end if;
 update public.perfiles set nombre=trim(p_datos->>'nombre'),apellido=trim(p_datos->>'apellido'),
 fecha_nacimiento=(p_datos->>'fecha_nacimiento')::date,grupo_sanguineo=p_datos->>'grupo_sanguineo',
 color_ojos=trim(p_datos->>'color_ojos'),vacaciones_anuales=(p_datos->>'vacaciones_anuales')::integer where id=auth.uid() and activo;
end $$;
create function public.cine_datos_registro() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 select raw_user_meta_data into d from auth.users where id=new.id;
 -- OAuth y cuentas previas pueden estar incompletos: deben completar /perfil antes de comprar.
 if d ? 'fecha_nacimiento' then
 perform public.cine_validar_datos_perfil(d);
 if (d->>'fecha_nacimiento')::date>current_date then raise exception 'Fecha de nacimiento futura';end if;
 new.fecha_nacimiento:=(d->>'fecha_nacimiento')::date;new.grupo_sanguineo:=d->>'grupo_sanguineo';
 new.color_ojos:=trim(d->>'color_ojos');new.vacaciones_anuales:=(d->>'vacaciones_anuales')::integer;
 end if;
 return new;
end $$;
create trigger cine_datos_al_registrar before insert on public.perfiles for each row execute function public.cine_datos_registro();

alter table public.cine_salas add column distribucion_documento boolean not null default false;
alter table public.cine_funciones add column vip_porcentaje numeric(5,2) not null default 25 check(vip_porcentaje>0 and vip_porcentaje<=500);
alter table public.peliculas add column precio_preventa numeric(12,2) check(precio_preventa>0);
alter table public.cine_entradas add column precio numeric(12,2);
alter table public.cine_reservas add column qr_compra uuid not null unique default gen_random_uuid();
alter table public.cine_reservas add column pago_simulado boolean not null default false;
alter table public.cine_reservas add column documento_pdf text;
alter table public.cine_reservas add column comprobante_emitido jsonb;

create function public.cine_butacas(p_sala uuid) returns table(codigo text,fila text,columna integer,bloque integer,tipo text)
language sql stable security definer set search_path='' as $$
 select chr(64+a)||b::text,chr(64+a),b,
 case when not s.distribucion_documento then 1 when a in (10,11) then case when b<=2 then 1 when b<=12 then 2 else 3 end else case when b<=4 then 1 when b<=24 then 2 else 3 end end,
 case when not s.distribucion_documento then 'normal' when a in (10,11) then 'accesible' when a>=18 then 'vip' else 'normal' end
 from public.cine_salas s cross join lateral generate_series(1,s.filas) a
 cross join lateral generate_series(1,case when s.distribucion_documento and a in(10,11) then 14 else s.columnas end) b where s.id=p_sala;
$$;
create or replace function public.cine_guardar_sala(p_nombre text,p_filas integer,p_columnas integer) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_nombre is null or length(trim(p_nombre)) not between 1 and 100 or p_filas<>20 or p_columnas<>28 then raise exception 'Sala: A–T, 28 butacas estándar y 14 en J/K';end if;
 insert into public.cine_salas(nombre,filas,columnas,distribucion_documento) values(trim(p_nombre),20,28,true) returning id into v;return v;
end $$;
create function public.cine_adaptar_sala(p_id uuid,p_nombre text,p_activa boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 -- Mismo orden de locks que creación/compra: nunca alterar una sala con compras futuras.
 perform 1 from public.cine_salas where id=p_id for update;
 if not found then raise exception 'Sala inexistente';end if;
 perform 1 from public.cine_funciones where sala_id=p_id order by id for update;
 perform 1 from public.cine_mutex for update;
 if exists(select 1 from public.cine_funciones f join public.cine_reservas r on r.funcion_id=f.id where f.sala_id=p_id and f.fin>now() and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>now()))) then raise exception 'No se puede modificar una sala con compras o reservas futuras';end if;
 if p_nombre is null or length(trim(p_nombre)) not between 1 and 100 or p_activa is null then raise exception 'Nombre o estado inválido';end if;
 update public.cine_salas set nombre=trim(p_nombre),activa=p_activa,filas=20,columnas=28,distribucion_documento=true where id=p_id;
end $$;

-- Funciones nuevas: asignación automática y formatos controlados. Parámetro de sala legado ignorado.
create or replace function public.cine_crear_funcion(p_pelicula uuid,p_sala uuid,p_inicio timestamptz,p_precio numeric,p_idioma text default null,p_formato text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.cine_salas;v uuid;dur integer;v_fin timestamptz;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_inicio is null or p_inicio<=now() or p_precio is null or p_precio<=0 or p_idioma is null or p_idioma not in('castellano','subtitulada') or p_formato is null or p_formato not in('2D','3D','4D','5D') then raise exception 'Datos de función inválidos';end if;
 select duracion_minutos into dur from public.peliculas where id=p_pelicula and activa and fecha_estreno<=(p_inicio at time zone 'America/Argentina/Buenos_Aires')::date;
 if not found then raise exception 'Película no disponible para esa fecha';end if;
 v_fin:=p_inicio+(dur+30)*interval '1 minute';
 for s in select * from public.cine_salas where activa and distribucion_documento order by nombre,id for update loop
 if not exists(select 1 from public.cine_funciones where sala_id=s.id and activa and inicio<v_fin and fin>p_inicio) then
 insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio,idioma,formato) values(p_pelicula,s.id,p_inicio,v_fin,p_precio,p_idioma,p_formato) returning id into v;
 return v;end if;
 end loop;
 raise exception 'No hay una sala adaptada disponible en ese horario';
end $$;
create function public.cine_precio_butaca(p_funcion uuid,p_butaca text) returns numeric language sql stable security definer set search_path='' as $$
 select round((case when p.fecha_estreno>(now() at time zone 'America/Argentina/Buenos_Aires')::date and p.precio_preventa is not null then p.precio_preventa else f.precio end)*(case when b.tipo='vip' then 1+f.vip_porcentaje/100 else 1 end),2)
 from public.cine_funciones f join public.peliculas p on p.id=f.pelicula_id cross join lateral public.cine_butacas(f.sala_id) b where f.id=p_funcion and b.codigo=p_butaca;
$$;
create function public.cine_configurar_precios(p_funcion uuid,p_vip numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 update public.cine_funciones set vip_porcentaje=p_vip where id=p_funcion;
 if not found then raise exception 'Función inexistente';end if;
end $$;
create function public.cine_editar_funcion(p_id uuid,p_precio numeric,p_idioma text,p_formato text,p_vip numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_funciones where id=p_id and inicio>now() for update;
 if not found then raise exception 'Función futura inexistente';end if;
 perform 1 from public.cine_mutex for update;
 if p_precio is null or p_precio<=0 or p_idioma is null or p_idioma not in('castellano','subtitulada') or p_formato is null or p_formato not in('2D','3D','4D','5D') then raise exception 'Datos de función inválidos';end if;
 update public.cine_funciones set precio=p_precio,idioma=p_idioma,formato=p_formato,vip_porcentaje=p_vip where id=p_id;
end $$;

alter function public.cine_guardar_pelicula(jsonb,uuid[]) rename to cine_guardar_pelicula_anterior;
revoke all on function public.cine_guardar_pelicula_anterior(jsonb,uuid[]) from public,anon,authenticated;
create function public.cine_guardar_pelicula(p_datos jsonb,p_generos uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if coalesce(cardinality(p_generos),0)<1 then raise exception 'Asociá al menos un género';end if;
 perform 1 from public.cine_mutex for update;
 if p_datos->>'clasificacion' is null or p_datos->>'clasificacion' not in('ATP','13','18') then raise exception 'Clasificación permitida: ATP, 13 o 18';end if;
 if nullif(trim(p_datos->>'sinopsis'),'') is null or nullif(trim(p_datos->>'poster_url'),'') is null then raise exception 'Sinopsis y afiche obligatorios';end if;
 v:=public.cine_guardar_pelicula_anterior(p_datos,p_generos);
 update public.peliculas set precio_preventa=nullif(p_datos->>'precio_preventa','')::numeric where id=v;
 return v;
end $$;
create function public.cine_bienvenida_porcentaje() returns integer language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 return (select bienvenida_porcentaje from public.cine_configuracion);
end $$;

-- Promociones existentes: ampliar sin eliminar canjes previos.
create function public.cine_guardar_genero(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid:=coalesce(nullif(p_datos->>'id','')::uuid,gen_random_uuid());col text;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if nullif(trim(p_datos->>'nombre'),'') is null or length(p_datos->>'nombre')>100 or p_datos->>'slug' is null or p_datos->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or (p_datos->>'activa')::boolean is null then raise exception 'Nombre, slug y estado de género inválidos';end if;
 select column_name into col from information_schema.columns where table_schema='public' and table_name='generos' and column_name in('activa','activo') and data_type='boolean' order by column_name limit 1;
 if col is null then raise exception 'Revisar columna de estado de generos';end if;
 execute format('insert into public.generos(id,nombre,slug,%I) values($1,$2,$3,$4) on conflict(id) do update set nombre=excluded.nombre,slug=excluded.slug,%I=excluded.%I',col,col,col) using v,trim(p_datos->>'nombre'),p_datos->>'slug',(p_datos->>'activa')::boolean;
 return v;
end $$;
alter table public.cine_productos add column categoria text not null default 'Otros' check(length(trim(categoria)) between 1 and 60);
alter table public.cine_combos add column incluye_entrada boolean not null default false;
alter table public.cine_cupones alter column porcentaje drop not null;
alter table public.cine_cupones alter column limite drop not null;
alter table public.cine_cupones add column tipo text not null default 'porcentaje' check(tipo in('porcentaje','monto','entrada','producto'));
alter table public.cine_cupones add column monto numeric(12,2) check(monto>0);
alter table public.cine_cupones add column edad_minima integer check(edad_minima between 0 and 120);
alter table public.cine_cupones add column primera_compra boolean not null default false;
alter table public.cine_cupones add column producto_id uuid references public.cine_productos(id);
alter table public.cine_recompensas add column tipo text not null default 'legado' check(tipo in('legado','entrada','producto'));
alter table public.cine_recompensas add column producto_id uuid references public.cine_productos(id);
-- No transformar descuentos antiguos en premios que no se prometieron.
update public.cine_recompensas set activa=false;
create table public.cine_configuracion(id boolean primary key default true check(id),bienvenida_porcentaje integer not null default 20 check(bienvenida_porcentaje between 1 and 100));
insert into public.cine_configuracion(id) values(true);
alter table public.cine_configuracion enable row level security;
revoke all on public.cine_configuracion from anon,authenticated;
create function public.cine_bienvenida() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.cine_cupones(codigo,porcentaje,desde,hasta,limite,usuario_id,solo_registrados,primera_compra)
 select 'BIENVENIDA-'||upper(gen_random_uuid()::text),bienvenida_porcentaje,now(),now()+interval '100 years',1,new.id,true,true from public.cine_configuracion;
 return null;
end $$;
create trigger cine_cupon_registro after insert on public.perfiles for each row execute function public.cine_bienvenida();
insert into public.cine_cupones(codigo,porcentaje,desde,hasta,limite,usuario_id,solo_registrados,primera_compra)
select 'BIENVENIDA-'||upper(gen_random_uuid()::text),20,now(),now()+interval '100 years',1,p.id,true,true from public.perfiles p
where not exists(select 1 from public.cine_reservas r where r.usuario_id=p.id and (r.estado='confirmada' or (r.estado='cancelada' and r.confirmada_por is not null)));

alter function public.cine_guardar_oferta(text,jsonb) rename to cine_guardar_oferta_anterior;
revoke all on function public.cine_guardar_oferta_anterior(text,jsonb) from public,anon,authenticated;
create function public.cine_guardar_oferta(p_tipo text,p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;d jsonb:=p_datos;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_mutex for update;
 if p_tipo='cupon' then
 if coalesce(d->>'tipo','porcentaje') not in('porcentaje','monto') then raise exception 'Tipo de cupón inválido';end if;
 if d->>'tipo'='monto' then d:=d||jsonb_build_object('porcentaje',1);end if;
 if d->>'tipo'='monto' and (nullif(d->>'monto','')::numeric is null or (d->>'monto')::numeric<=0) then raise exception 'Monto inválido';end if;
 elsif p_tipo='recompensa' then
 if d->>'tipo' is null or d->>'tipo' not in('entrada','producto') then raise exception 'Recompensa: entrada gratuita o producto';end if;
 if d->>'tipo'='producto' and not exists(select 1 from public.cine_productos where id=(d->>'producto_id')::uuid and activo) then raise exception 'Seleccioná un producto activo';end if;
 d:=d||jsonb_build_object('porcentaje',100);
 end if;
 v:=public.cine_guardar_oferta_anterior(p_tipo,d);
 if p_tipo='producto' then update public.cine_productos set categoria=trim(coalesce(nullif(d->>'categoria',''),'Otros')) where id=v;
 elsif p_tipo='combo' then update public.cine_combos set incluye_entrada=coalesce((d->>'incluye_entrada')::boolean,false) where id=v;
 elsif p_tipo='cupon' then update public.cine_cupones set tipo=coalesce(d->>'tipo','porcentaje'),monto=nullif(d->>'monto','')::numeric,edad_minima=nullif(d->>'edad_minima','')::integer where id=v;
 elsif p_tipo='recompensa' then update public.cine_recompensas set tipo=d->>'tipo',producto_id=nullif(d->>'producto_id','')::uuid where id=v;
 end if;
 return v;
end $$;
create function public.cine_configurar_bienvenida(p_porcentaje integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_mutex for update;
 update public.cine_configuracion set bienvenida_porcentaje=p_porcentaje;
 update public.cine_cupones set porcentaje=p_porcentaje where primera_compra;
end $$;

-- Reutiliza controles de stock y composición, recalculando entradas/promociones en servidor.
alter function public.cine_calcular_checkout(uuid,text[],jsonb,text,numeric) rename to cine_calcular_checkout_anterior;
revoke all on function public.cine_calcular_checkout_anterior(uuid,text[],jsonb,text,numeric) from public,anon,authenticated;
create function public.cine_calcular_checkout(p_funcion uuid,p_butacas text[],p_candy jsonb,p_cupon text,p_credito numeric) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.cine_funciones;p public.peliculas;cu public.cine_cupones;v jsonb;sub numeric;des numeric:=0;total numeric;edad integer;cantidad_entradas integer;entrada_combo numeric:=0;item jsonb;
begin
 select * into f from public.cine_funciones where id=p_funcion and activa and inicio>now();
 if not found then raise exception 'Función no disponible';end if;
 select * into p from public.peliculas where id=f.pelicula_id and activa;
 if not found then raise exception 'Película no disponible';end if;
 if p.clasificacion::text not in('ATP','13','18') then raise exception 'El administrador debe adaptar la clasificación de esta película';end if;
 if not exists(select 1 from public.cine_salas where id=f.sala_id and activa and distribucion_documento) then raise exception 'El administrador debe adaptar la distribución de esta sala antes de vender nuevas entradas';end if;
 if f.idioma not in('castellano','subtitulada') or f.formato not in('2D','3D','4D','5D') then raise exception 'El administrador debe adaptar el idioma/formato de esta función';end if;
 if p.fecha_estreno>(now() at time zone 'America/Argentina/Buenos_Aires')::date and (p.precio_preventa is null or p.fecha_estreno>(now() at time zone 'America/Argentina/Buenos_Aires')::date+7) then raise exception 'La preventa todavía no está habilitada';end if;
 if auth.uid() is not null then
 perform public.cine_validar_datos_perfil((select to_jsonb(pr) from public.perfiles pr where id=auth.uid()));
 if exists(select 1 from public.perfiles where id=auth.uid() and fecha_nacimiento>(now() at time zone 'America/Argentina/Buenos_Aires')::date) then raise exception 'Fecha de nacimiento futura';end if;
 select extract(year from age((now() at time zone 'America/Argentina/Buenos_Aires')::date,fecha_nacimiento))::integer into edad from public.perfiles where id=auth.uid();
 if edad is null or edad<0 then raise exception 'Completá tu fecha de nacimiento válida en Mi perfil';end if;
 if p.clasificacion::text<>'ATP' and edad<p.clasificacion::text::integer then raise exception 'No cumplís la edad mínima de esta película';end if;
 end if;
 if exists(select 1 from unnest(p_butacas) x where not exists(select 1 from public.cine_butacas(f.sala_id) b where b.codigo=x)) then raise exception 'Butaca inexistente en la distribución de la sala';end if;
 if (select count(distinct b.bloque) from public.cine_butacas(f.sala_id) b where b.codigo=any(p_butacas))>1 then raise exception 'Elegí butacas contiguas sin cruzar un pasillo';end if;
 v:=public.cine_calcular_checkout_anterior(p_funcion,p_butacas,p_candy,'',0);
 v:=v||jsonb_build_object('candy',public.cine_marcar_productos(p_candy,v->'candy'));
 sub:=(v->>'subtotal')::numeric-f.precio*cardinality(p_butacas)+(select sum(public.cine_precio_butaca(p_funcion,x)) from unnest(p_butacas) x);
 -- Cada unidad de combo con entrada sustituye el precio de una entrada elegida.
 select coalesce(sum((a->>'cantidad')::integer),0)::integer into cantidad_entradas from jsonb_array_elements(p_candy) a join public.cine_combos c on c.id=(a->>'id')::uuid where a->>'tipo'='combo' and c.incluye_entrada;
 if cantidad_entradas>cardinality(p_butacas) then raise exception 'Hay más entradas en combos que butacas elegidas';end if;
 if cantidad_entradas>0 then
 entrada_combo:=cantidad_entradas*case when p.fecha_estreno>(now() at time zone 'America/Argentina/Buenos_Aires')::date and p.precio_preventa is not null then p.precio_preventa else f.precio end;
 sub:=sub-entrada_combo;end if;
 if nullif(trim(p_cupon),'') is not null then
 select * into cu from public.cine_cupones where codigo=upper(trim(p_cupon)) and activo and desde<=now() and hasta>now();
 if not found then raise exception 'Cupón inválido o vencido';end if;
 if sub<cu.minimo or (cu.pelicula_id is not null and cu.pelicula_id<>f.pelicula_id) or (cu.usuario_id is not null and cu.usuario_id is distinct from auth.uid()) or (cu.solo_registrados and auth.uid() is null) or (cu.edad_minima is not null and (edad is null or edad<cu.edad_minima)) then raise exception 'No cumplís las condiciones del cupón';end if;
 if cu.primera_compra and exists(select 1 from public.cine_reservas where usuario_id=auth.uid() and (estado='confirmada' or (estado='cancelada' and confirmada_por is not null))) then raise exception 'Cupón exclusivo de primera compra';end if;
 if cu.limite is not null and (select count(*) from public.cine_reservas where cupon_id=cu.id and (estado='confirmada' or (estado='cancelada' and confirmada_por is not null) or (estado='pendiente' and vence>now())))>=cu.limite then raise exception 'Cupón agotado';end if;
 if cu.tipo='porcentaje' then des:=round(sub*cu.porcentaje/100,2);
 elsif cu.tipo='monto' then des:=least(sub,cu.monto);
 elsif cu.tipo='entrada' then
 if cantidad_entradas>0 then raise exception 'Canje de entrada no combinable con combo que incluye entrada';end if;
 select max(public.cine_precio_butaca(p_funcion,x)) into des from unnest(p_butacas) x;
 elsif cu.tipo='producto' then
 select (a->>'precio')::numeric into des from jsonb_array_elements(v->'candy') a where a->>'producto_id'=cu.producto_id::text and a->>'tipo'='producto';
 if des is null then raise exception 'Agregá el producto canjeado al pedido';end if;
 end if;
 end if;
 total:=greatest(0,sub-coalesce(des,0));
 if p_credito is null or p_credito<0 or p_credito<>round(p_credito,2) or p_credito>total then raise exception 'Crédito inválido';end if;
 if p_credito>0 and (auth.uid() is null or p_credito>(public.cine_saldos(auth.uid())->>'credito_disponible')::numeric) then raise exception 'Crédito insuficiente';end if;
 return v||jsonb_build_object('subtotal',sub,'descuento',coalesce(des,0),'total',total,'credito',p_credito,'a_pagar',total-p_credito,'cupon_id',cu.id,
 'entradas',(select jsonb_agg(jsonb_build_object('butaca',b.codigo,'tipo',b.tipo,'precio',public.cine_precio_butaca(p_funcion,b.codigo)) order by b.columna) from public.cine_butacas(f.sala_id) b where b.codigo=any(p_butacas)),
 'pelicula',jsonb_build_object('titulo',p.titulo,'clasificacion',p.clasificacion),'sala',(select nombre from public.cine_salas where id=f.sala_id),'funcion',to_jsonb(f));
end $$;

-- Marca el producto individual en el detalle para aplicar un canje de UNA unidad.
-- Se conserva el cálculo anterior completo y su política de stock.
create function public.cine_marcar_productos(p_candy jsonb,p_detalle jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(d.value||case when a.value->>'tipo'='producto' then jsonb_build_object('producto_id',a.value->>'id') else '{}'::jsonb end order by d.ordinality),'[]')
 from jsonb_array_elements(p_detalle) with ordinality d join jsonb_array_elements(p_candy) with ordinality a on a.ordinality=d.ordinality;
$$;
-- El cálculo se envuelve una sola vez; el nombre interno queda fuera de los permisos cliente.
alter function public.cine_calcular_checkout(uuid,text[],jsonb,text,numeric) rename to cine_calcular_checkout_documento;
create function public.cine_calcular_checkout(p_funcion uuid,p_butacas text[],p_candy jsonb,p_cupon text,p_credito numeric) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 v:=public.cine_calcular_checkout_documento(p_funcion,p_butacas,p_candy,p_cupon,p_credito);
 return v||jsonb_build_object('candy',public.cine_marcar_productos(p_candy,v->'candy'));
end $$;

create or replace function public.cine_disponibilidad(p_funcion uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.cine_funciones;s public.cine_salas;
begin
 select * into f from public.cine_funciones where id=p_funcion and activa and inicio>now();
 if not found or not exists(select 1 from public.peliculas where id=f.pelicula_id and activa) then raise exception 'Función no disponible';end if;
 select * into s from public.cine_salas where id=f.sala_id and activa;
 if not found then raise exception 'Sala no disponible';end if;
 return jsonb_build_object('funcion',to_jsonb(f),'sala',to_jsonb(s),
 'butacas',(select jsonb_agg(to_jsonb(b)||jsonb_build_object('precio',public.cine_precio_butaca(f.id,b.codigo)) order by b.fila,b.columna) from public.cine_butacas(s.id) b),
 'ocupadas',coalesce((select jsonb_agg(e.butaca) from public.cine_entradas e join public.cine_reservas r on r.id=e.reserva_id where e.funcion_id=f.id and e.activa and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>now()))),'[]'));
end $$;

-- Atomicidad: SOLO la Edge Function (service_role) puede entrar a este RPC.
-- Recibe identidad verificada por Auth y un PDF ya renderizado antes del commit.
create function public.cine_comprar_documento(p_usuario uuid,p_datos jsonb,p_qr uuid,p_pdf text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;v jsonb;token uuid;bs text[];x jsonb;f uuid;pedido jsonb;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_usuario::text,''),true);
 -- auth.uid() usa request.jwt.claim.sub en Supabase; se reemplaza también claims, nunca roles de metadata.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_usuario,'role',case when p_usuario is null then 'anon' else 'authenticated' end)::text,true);
  if p_usuario is not null and not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Perfil inactivo o no disponible';end if;
 f:=(p_datos->>'funcion')::uuid;
 select array_agg(value) into bs from jsonb_array_elements_text(p_datos->'butacas');
 perform 1 from public.cine_funciones where id=f for update;
 perform 1 from public.cine_mutex for update;
 pedido:=p_datos;
 select * into r from public.cine_reservas where solicitud=(p_datos->>'solicitud')::uuid;
 if found then
 if r.usuario_id is distinct from p_usuario or r.pedido is distinct from pedido or not r.pago_simulado then raise exception 'Solicitud ya utilizada';end if;
 return r.token;end if;
 if p_qr is null or p_pdf is null or length(p_pdf) not between 20 and 500000 then raise exception 'Comprobante no generado';end if;
 if p_usuario is null and coalesce((p_datos->>'edad')::boolean,false) is not true and exists(select 1 from public.peliculas p join public.cine_funciones fu on fu.pelicula_id=p.id where fu.id=f and p.clasificacion::text<>'ATP') then raise exception 'Confirmá la edad mínima';end if;
 v:=public.cine_calcular_checkout(f,bs,p_datos->'candy',p_datos->>'cupon',(p_datos->>'credito')::numeric);
 if p_datos->'cotizacion' is distinct from (v-'stock_items'-'cupon_id') then raise exception 'El precio o los datos cambiaron. Volvé a cotizar';end if;
 if nullif(trim(p_datos->>'email'),'') is null or length(p_datos->>'email')>254 or p_datos->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo inválido';end if;
 update public.cine_entradas e set activa=false from public.cine_reservas vencida where vencida.id=e.reserva_id and e.funcion_id=f and vencida.estado='pendiente' and vencida.vence<=now() and e.activa;
 insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,comprador,edad_confirmada,pedido,total,subtotal,descuento,credito,cupon_id,candy,stock_items,vence,estado,puntos,confirmada_por,qr_compra,pago_simulado,documento_pdf,comprobante_emitido)
 values((p_datos->>'solicitud')::uuid,f,p_usuario,trim(p_datos->>'email'),trim(coalesce(p_datos->>'nombre','Invitado')),coalesce((p_datos->>'edad')::boolean,false),pedido,(v->>'total')::numeric,(v->>'subtotal')::numeric,(v->>'descuento')::numeric,(v->>'credito')::numeric,(v->>'cupon_id')::uuid,v->'candy',v->'stock_items',now(),'confirmada',case when p_usuario is null then 0 else floor((v->>'a_pagar')::numeric)::integer end,p_usuario,p_qr,true,p_pdf,v-'stock_items'-'cupon_id') returning * into r;
 insert into public.cine_entradas(reserva_id,funcion_id,butaca,precio) select r.id,f,b->>'butaca',(b->>'precio')::numeric from jsonb_array_elements(v->'entradas') b;
 for x in select value from jsonb_array_elements(r.stock_items) loop
 update public.cine_productos set stock=stock-(x->>'cantidad')::integer where id=(x->>'id')::uuid and activo and stock>=(x->>'cantidad')::integer;
 if not found then raise exception 'Stock insuficiente';end if;end loop;
 if p_usuario is not null then
 if r.credito>0 then insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(p_usuario,'credito',-r.credito,'Compra',r.id);end if;
 if r.puntos>0 then insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(p_usuario,'puntos',r.puntos,'Compra',r.id);end if;
 insert into public.cine_notificaciones(usuario_id,mensaje) values(p_usuario,'Compra confirmada con pago simulado (sin cargo real). Comprobante y QR disponibles.');end if;
 return r.token;
end $$;
revoke all on function public.cine_comprar_documento(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.cine_comprar_documento(uuid,jsonb,uuid,text) to service_role;
grant select on public.cine_reservas to service_role;
-- Cerrar bypasses antiguos sin borrar reservas históricas pendientes.
revoke all on function public.cine_checkout(uuid,text[],jsonb,text,numeric,text,text,boolean,uuid,numeric),public.cine_confirmar_reserva(uuid) from public,anon,authenticated;

alter function public.cine_comprobante(uuid) rename to cine_comprobante_anterior;
revoke all on function public.cine_comprobante_anterior(uuid) from public,anon,authenticated;
create function public.cine_comprobante(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.cine_reservas;
begin
 select * into r from public.cine_reservas where token=p_token;
 if not found then raise exception 'Compra inexistente';end if;
 return public.cine_comprobante_anterior(p_token)||jsonb_build_object('qr_compra',r.qr_compra,'pago_simulado',r.pago_simulado,'documento_pdf',r.documento_pdf,
 'entradas',(select coalesce(jsonb_agg(jsonb_build_object('butaca',e.butaca,'codigo',e.codigo,'usada_en',e.usada_en,'precio',e.precio) order by e.butaca),'[]') from public.cine_entradas e where e.reserva_id=r.id));
end $$;
alter function public.cine_detalle_reserva(uuid) rename to cine_detalle_reserva_anterior;
revoke all on function public.cine_detalle_reserva_anterior(uuid) from public,anon,authenticated;
create function public.cine_detalle_reserva(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;r public.cine_reservas;
begin
 v:=public.cine_detalle_reserva_anterior(p_token);
 select * into r from public.cine_reservas where token=p_token;
 if r.comprobante_emitido is not null then
 v:=v||jsonb_build_object('pelicula',(v->'pelicula')||(r.comprobante_emitido->'pelicula'),'sala',r.comprobante_emitido->'sala','funcion',r.comprobante_emitido->'funcion');
 end if;
 return v||jsonb_build_object('poster_url',(select p.poster_url from public.peliculas p join public.cine_funciones f on f.pelicula_id=p.id where f.id=r.funcion_id),
 'calificacion_propia',(select calificacion from public.cine_resenas where reserva_id=r.id and usuario_id=r.usuario_id));
end $$;

create or replace function public.cine_validar_prestacion(p_codigo uuid,p_tipo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;f public.cine_funciones;resultado jsonb;butacas_ingreso text[];
begin
 if not public.cine_rol(array['empleado','administrador']) then raise exception 'Acceso denegado';end if;
 begin
 select * into r from public.cine_reservas where qr_compra=p_codigo;
  -- Compatibilidad SOLO para compras históricas. Las nuevas admiten exclusivamente qr_compra.
  if not found then select * into r from public.cine_reservas where not pago_simulado and (candy_codigo=p_codigo or id in(select reserva_id from public.cine_entradas where codigo=p_codigo));end if;
 if not found then raise exception 'Código inexistente';end if;
 select * into f from public.cine_funciones where id=r.funcion_id for update;
 select * into r from public.cine_reservas where id=r.id for update;
 if r.estado<>'confirmada' then raise exception 'Compra no habilitada';end if;
 if not f.activa or clock_timestamp()<f.inicio-interval '30 minutes' or clock_timestamp()>f.fin-interval '30 minutes' then raise exception 'Fuera del horario de la función';end if;
  if p_tipo='entrada' then
  if exists(select 1 from public.cine_entradas where codigo=p_codigo and usada_en is not null) then raise exception 'Código histórico ya utilizado';end if;
  select array_agg(butaca order by butaca) into butacas_ingreso from public.cine_entradas where reserva_id=r.id and activa and usada_en is null;
  if butacas_ingreso is null then raise exception 'Ingreso ya utilizado';end if;
  -- Compras históricas parcialmente utilizadas: solo autorizar las butacas restantes.
  update public.cine_entradas set usada_en=clock_timestamp(),usada_por=auth.uid() where reserva_id=r.id and activa and usada_en is null;
  resultado:=jsonb_build_object('ok',true,'mensaje','Ingreso autorizado: '||array_to_string(butacas_ingreso,', '),'funcion',f.id);
 elsif p_tipo='candy' then
 if jsonb_array_length(r.candy)=0 then raise exception 'Esta compra no incluye candy';end if;
 if r.candy_usada_en is not null then raise exception 'Candy ya retirado';end if;
 update public.cine_reservas set candy_usada_en=clock_timestamp(),candy_usada_por=auth.uid() where id=r.id;
 resultado:=jsonb_build_object('ok',true,'mensaje','Retiro autorizado','candy',r.candy);
 else raise exception 'Prestación inválida';end if;
 if r.usuario_id is not null then insert into public.cine_notificaciones(usuario_id,mensaje) values(r.usuario_id,case when p_tipo='entrada' then 'Ingreso a sala validado.' else 'Candy retirado.' end);end if;
 exception when raise_exception then resultado:=jsonb_build_object('ok',false,'mensaje',sqlerrm);end;
 insert into public.cine_validaciones(empleado_id,codigo,prestacion,resultado) values(auth.uid(),p_codigo,coalesce(p_tipo,''),resultado->>'mensaje');
 return resultado;
end $$;
create function public.cine_validar_compra(p_codigo uuid,p_tipo text,p_funcion uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['empleado','administrador']) then raise exception 'Acceso denegado';end if;
 if p_funcion is null then raise exception 'Seleccioná la función que estás operando';end if;
  if exists(select 1 from public.cine_reservas where (qr_compra=p_codigo or (not pago_simulado and (candy_codigo=p_codigo or id in(select reserva_id from public.cine_entradas where codigo=p_codigo)))) and funcion_id<>p_funcion) then
 insert into public.cine_validaciones(empleado_id,codigo,prestacion,resultado) values(auth.uid(),p_codigo,p_tipo,'Código correspondiente a otra función');
 return jsonb_build_object('ok',false,'mensaje','Código correspondiente a otra función');end if;
 return public.cine_validar_prestacion(p_codigo,p_tipo);
end $$;
revoke all on function public.cine_validar_prestacion(uuid,text),public.cine_validar_entrada(uuid) from public,anon,authenticated;

create or replace function public.cine_canjear(p_recompensa uuid,p_solicitud uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.cine_recompensas;c public.cine_canjes;v_cupon uuid;v_id uuid;
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) or p_solicitud is null then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_mutex for update;
 select * into c from public.cine_canjes where solicitud=p_solicitud;
 if found then if c.usuario_id<>auth.uid() or c.recompensa_id<>p_recompensa then raise exception 'Solicitud ya utilizada';end if;return;end if;
 select * into r from public.cine_recompensas where id=p_recompensa and activa and tipo in('entrada','producto') and desde<=now() and hasta>now();
 if not found then raise exception 'Recompensa no disponible';end if;
 if (public.cine_saldos(auth.uid())->>'puntos_disponibles')::numeric<r.puntos then raise exception 'Puntos disponibles insuficientes';end if;
 if r.tipo='producto' and not exists(select 1 from public.cine_productos where id=r.producto_id and activo) then raise exception 'Producto no disponible';end if;
 insert into public.cine_cupones(codigo,porcentaje,tipo,producto_id,desde,hasta,limite,usuario_id,solo_registrados) values('CANJE-'||upper(gen_random_uuid()::text),100,r.tipo,r.producto_id,now(),r.hasta,1,auth.uid(),true) returning id into v_cupon;
 insert into public.cine_canjes(usuario_id,recompensa_id,nombre,puntos,cupon_id,solicitud) values(auth.uid(),r.id,r.nombre,r.puntos,v_cupon,p_solicitud) returning id into v_id;
 insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,canje_id) values(auth.uid(),'puntos',-r.puntos,'Canje',v_id);
 insert into public.cine_notificaciones(usuario_id,mensaje) values(auth.uid(),'Canje listo: aplicá el código en checkout para una entrada o una unidad del producto.');
end $$;
alter function public.cine_mis_beneficios() rename to cine_mis_beneficios_anterior;
revoke all on function public.cine_mis_beneficios_anterior() from public,anon,authenticated;
create function public.cine_mis_beneficios() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
 return public.cine_mis_beneficios_anterior()||jsonb_build_object('cupones',coalesce((select jsonb_agg(jsonb_build_object('codigo',codigo,'porcentaje',porcentaje,'tipo',tipo,'hasta',hasta)) from public.cine_cupones cu where usuario_id=auth.uid() and activo and hasta>now() and (not primera_compra or not exists(select 1 from public.cine_reservas where usuario_id=auth.uid() and (estado='confirmada' or (estado='cancelada' and confirmada_por is not null)))) and not exists(select 1 from public.cine_reservas where cupon_id=cu.id and (estado='confirmada' or (estado='cancelada' and confirmada_por is not null)))),'[]'));
end $$;

create trigger cine_funciones_audit after insert or update on public.cine_funciones for each row execute function public.cine_auditar();
create trigger cine_salas_audit after insert or update on public.cine_salas for each row execute function public.cine_auditar();
create trigger cine_validaciones_audit after insert on public.cine_validaciones for each row execute function public.cine_auditar();
create trigger cine_precios_audit after update on public.cine_productos for each row execute function public.cine_auditar();
create trigger cine_configuracion_audit after update on public.cine_configuracion for each row execute function public.cine_auditar();
create function public.cine_consultar_auditoria(p_desde timestamptz,p_hasta timestamptz,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 if p_desde is null or p_hasta is null or p_hasta<=p_desde or p_offset<0 then raise exception 'Filtro inválido';end if;
 -- Excluir tokens, códigos, contacto y PDF del visor. El registro íntegro permanece privado.
 return coalesce((select jsonb_agg(to_jsonb(t)) from (select id,tabla,operacion,usuario_id,creada from public.cine_auditoria where creada>=p_desde and creada<p_hasta order by id desc limit 100 offset p_offset) t),'[]');
end $$;

-- GET público cacheable. Nunca devuelve compras, cuentas ni tokens.
create function public.cine_cartelera() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by item->>'titulo'),'[]') from (
 select a.item||jsonb_build_object('formatos',coalesce((select jsonb_agg(distinct f.formato) from public.cine_funciones f where f.pelicula_id=(a.item->>'id')::uuid and f.activa and f.inicio>now()),'[]'),
 'idiomas',coalesce((select jsonb_agg(distinct f.idioma) from public.cine_funciones f where f.pelicula_id=(a.item->>'id')::uuid and f.activa and f.inicio>now()),'[]'),
 'ventas',(select count(*) from public.cine_entradas e join public.cine_reservas r on r.id=e.reserva_id join public.cine_funciones f on f.id=e.funcion_id where f.pelicula_id=(a.item->>'id')::uuid and r.estado='confirmada')) item
 from jsonb_array_elements(public.cine_catalogo(false)) a(item)) t;
$$;
-- Eventos públicos sin datos personales; NO habilitar Realtime sobre reservas/entradas.
create table public.cine_eventos_publicos(id text primary key,funcion_id uuid references public.cine_funciones(id),revision bigint not null default 1);
alter table public.cine_eventos_publicos enable row level security;
grant select on public.cine_eventos_publicos to anon,authenticated;
create policy cine_eventos_lectura on public.cine_eventos_publicos for select using(true);
create function public.cine_evento_disponibilidad() returns trigger language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 if tg_table_name='cine_funciones' then v:=new.id;else v:=new.funcion_id;end if;
 insert into public.cine_eventos_publicos(id,funcion_id) values(v::text,v) on conflict(id) do update set revision=public.cine_eventos_publicos.revision+1;
  insert into public.cine_eventos_publicos(id) values('cartelera') on conflict(id) do update set revision=public.cine_eventos_publicos.revision+1;
 return null;
end $$;
create trigger cine_entradas_evento after insert or update on public.cine_entradas for each row execute function public.cine_evento_disponibilidad();
create trigger cine_funciones_evento after insert or update on public.cine_funciones for each row execute function public.cine_evento_disponibilidad();
create function public.cine_evento_catalogo() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.cine_eventos_publicos(id) values('cartelera') on conflict(id) do update set revision=public.cine_eventos_publicos.revision+1;return null;end $$;
create trigger cine_peliculas_evento after insert or update on public.peliculas for each row execute function public.cine_evento_catalogo();
create trigger cine_generos_evento after insert or update on public.generos for each statement execute function public.cine_evento_catalogo();
create trigger cine_asociaciones_evento after insert or delete on public.peliculas_generos for each statement execute function public.cine_evento_catalogo();
-- Supabase Cloud tiene esta publicación; el entorno local de pruebas puede no tenerla.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then execute 'alter publication supabase_realtime add table public.cine_eventos_publicos';end if;
end $$;

do $$ declare f record;begin
 for f in select oid::regprocedure firma,proname from pg_proc where pronamespace='public'::regnamespace and proname in
 ('cine_validar_datos_perfil','cine_completar_perfil','cine_datos_registro','cine_butacas','cine_adaptar_sala','cine_precio_butaca','cine_configurar_precios','cine_editar_funcion','cine_guardar_genero','cine_guardar_pelicula','cine_guardar_oferta','cine_configurar_bienvenida','cine_bienvenida_porcentaje','cine_bienvenida','cine_calcular_checkout','cine_calcular_checkout_documento','cine_marcar_productos','cine_comprobante','cine_detalle_reserva','cine_validar_compra','cine_mis_beneficios','cine_consultar_auditoria','cine_cartelera','cine_evento_disponibilidad','cine_evento_catalogo') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.firma);
 if f.proname in('cine_completar_perfil','cine_adaptar_sala','cine_configurar_precios','cine_editar_funcion','cine_guardar_genero','cine_guardar_pelicula','cine_guardar_oferta','cine_configurar_bienvenida','cine_bienvenida_porcentaje','cine_comprobante','cine_detalle_reserva','cine_validar_compra','cine_mis_beneficios','cine_consultar_auditoria','cine_cartelera') then execute format('grant execute on function %s to authenticated',f.firma);end if;
 if f.proname in('cine_comprobante','cine_detalle_reserva','cine_cartelera') then execute format('grant execute on function %s to anon',f.firma);end if;
 end loop;
end $$;
commit;
