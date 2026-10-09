-- Aplicar una vez, después de 20261008000100_perfil_historial.sql.
-- Pago presencial. No hay pasarela ni simulación de cobro.
begin;
create table public.cine_mutex(id boolean primary key default true check(id));
insert into public.cine_mutex values(true);
create table public.cine_productos(
 id uuid primary key default gen_random_uuid(),nombre text not null check(length(trim(nombre)) between 1 and 100),
 precio numeric(12,2) not null check(precio>0),stock integer not null check(stock>=0),activo boolean not null default true
);
create table public.cine_combos(
 id uuid primary key default gen_random_uuid(),nombre text not null check(length(trim(nombre)) between 1 and 100),
 precio numeric(12,2) not null check(precio>0),activo boolean not null default true
);
create table public.cine_combo_items(
 combo_id uuid references public.cine_combos(id),producto_id uuid references public.cine_productos(id),cantidad integer not null check(cantidad between 1 and 20),primary key(combo_id,producto_id)
);
create table public.cine_cupones(
 id uuid primary key default gen_random_uuid(),codigo text not null unique check(codigo=upper(trim(codigo))),
 porcentaje integer not null check(porcentaje between 1 and 100),minimo numeric(12,2) not null default 0 check(minimo>=0),
 desde timestamptz not null,hasta timestamptz not null check(hasta>desde),limite integer not null check(limite>0),
 pelicula_id uuid references public.peliculas(id),usuario_id uuid references auth.users(id),solo_registrados boolean not null default false,activo boolean not null default true
);
create table public.cine_recompensas(
 id uuid primary key default gen_random_uuid(),nombre text not null check(length(trim(nombre)) between 1 and 100),puntos integer not null check(puntos>0),
 porcentaje integer not null check(porcentaje between 1 and 100),desde timestamptz not null,hasta timestamptz not null check(hasta>desde),activa boolean not null default true
);
create table public.cine_canjes(
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id),recompensa_id uuid not null references public.cine_recompensas(id),
 nombre text not null,puntos integer not null,cupon_id uuid not null references public.cine_cupones(id),solicitud uuid not null unique,creada timestamptz not null default now()
);
create table public.cine_movimientos(
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id),tipo text not null check(tipo in ('credito','puntos')),
 importe numeric(12,2) not null,motivo text not null,reserva_id uuid references public.cine_reservas(id),canje_id uuid references public.cine_canjes(id),creada timestamptz not null default now(),unique(reserva_id,tipo,motivo),unique(canje_id,tipo)
);
create table public.cine_notificaciones(
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id),mensaje text not null,leida boolean not null default false,creada timestamptz not null default now(),clave text,unique(usuario_id,clave)
);
create table public.cine_alertas(usuario_id uuid references auth.users(id),pelicula_id uuid references public.peliculas(id),creada timestamptz not null default now(),primary key(usuario_id,pelicula_id));
create table public.cine_resenas(
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id),reserva_id uuid not null references public.cine_reservas(id),pelicula_id uuid not null references public.peliculas(id),
 nombre text not null,calificacion integer not null check(calificacion between 1 and 5),texto text not null check(length(trim(texto)) between 1 and 2000),creada timestamptz not null default now(),unique(usuario_id,reserva_id)
);
create table public.cine_validaciones(
 id uuid primary key default gen_random_uuid(),empleado_id uuid not null references auth.users(id),codigo uuid not null,prestacion text not null,resultado text not null,creada timestamptz not null default now()
);
alter table public.cine_reservas drop constraint cine_reservas_estado_check;
alter table public.cine_reservas add constraint cine_reservas_estado_check check(estado in ('pendiente','confirmada','cancelada'));
alter table public.cine_reservas add column comprador text;
alter table public.cine_reservas add column edad_confirmada boolean not null default false;
alter table public.cine_reservas add column pedido jsonb;
alter table public.cine_reservas add column candy jsonb not null default '[]';
alter table public.cine_reservas add column stock_items jsonb not null default '[]';
alter table public.cine_reservas add column subtotal numeric(12,2);
alter table public.cine_reservas add column descuento numeric(12,2) not null default 0;
alter table public.cine_reservas add column credito numeric(12,2) not null default 0;
alter table public.cine_reservas add column puntos integer not null default 0;
alter table public.cine_reservas add column cupon_id uuid references public.cine_cupones(id);
alter table public.cine_reservas add column candy_codigo uuid not null unique default gen_random_uuid();
alter table public.cine_reservas add column candy_usada_en timestamptz;
alter table public.cine_reservas add column candy_usada_por uuid references auth.users(id);
alter table public.cine_entradas add column activa boolean not null default true;
alter table public.cine_entradas drop constraint cine_entradas_funcion_id_butaca_key;
create unique index cine_butaca_activa on public.cine_entradas(funcion_id,butaca) where activa;
create index on public.cine_reservas(usuario_id,creada desc);
create index on public.cine_movimientos(usuario_id,tipo);
create index on public.cine_notificaciones(usuario_id,creada desc);
-- El catálogo remoto puede tener estos campos desde antes de este bloque.
-- Conservar su definición y valores; no convertir tipos ni sobrescribir datos.
alter table public.peliculas add column if not exists idioma text not null default 'Español';
alter table public.peliculas add column if not exists formato text not null default '2D';
alter table public.cine_funciones add column if not exists idioma text not null default 'Español';
alter table public.cine_funciones add column if not exists formato text not null default '2D';

-- Todas las escrituras económicas pasan por RPC. El mutex serializa stock/cupones/saldos.
do $$ declare t text;begin
 foreach t in array array['cine_mutex','cine_productos','cine_combos','cine_combo_items','cine_cupones','cine_recompensas','cine_canjes','cine_movimientos','cine_notificaciones','cine_alertas','cine_resenas','cine_validaciones'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;

create function public.cine_saldos(p_usuario uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'credito',coalesce((select sum(importe) from public.cine_movimientos where usuario_id=p_usuario and tipo='credito'),0),
 'credito_disponible',coalesce((select sum(importe) from public.cine_movimientos where usuario_id=p_usuario and tipo='credito'),0)-coalesce((select sum(credito) from public.cine_reservas where usuario_id=p_usuario and estado='pendiente' and vence>now()),0),
 'puntos',coalesce((select sum(importe) from public.cine_movimientos where usuario_id=p_usuario and tipo='puntos'),0),
 'puntos_disponibles',coalesce((select sum(importe) from public.cine_movimientos where usuario_id=p_usuario and tipo='puntos'),0)-coalesce((select sum(r.puntos) from public.cine_reservas r join public.cine_funciones f on f.id=r.funcion_id where r.usuario_id=p_usuario and r.estado='confirmada' and f.inicio>=now()+interval '2 hours'),0));
$$;

create function public.cine_candy_catalogo() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('productos',coalesce((select jsonb_agg(to_jsonb(p) order by nombre) from public.cine_productos p where activo),'[]'),
 'combos',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('items',(select jsonb_agg(jsonb_build_object('nombre',p.nombre,'cantidad',i.cantidad)) from public.cine_combo_items i join public.cine_productos p on p.id=i.producto_id where i.combo_id=c.id)) order by nombre) from public.cine_combos c where activo and exists(select 1 from public.cine_combo_items where combo_id=c.id)),'[]'));
$$;

create function public.cine_calcular_checkout(p_funcion uuid,p_butacas text[],p_candy jsonb,p_cupon text,p_credito numeric) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.cine_funciones;s public.cine_salas;p public.cine_productos;c public.cine_combos;cu public.cine_cupones;v_item jsonb;qty integer;
 detalle jsonb:='[]';consumo jsonb:='[]';sub numeric;des numeric:=0;total numeric;disponible numeric;stock_reservado integer;
begin
 if auth.uid() is not null and not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Perfil inactivo o no disponible';end if;
 select * into f from public.cine_funciones where id=p_funcion and activa and inicio>now();
 if not found or not exists(select 1 from public.peliculas where id=f.pelicula_id and activa) then raise exception 'Función no disponible';end if;
 select * into s from public.cine_salas where id=f.sala_id and activa;
 if not found then raise exception 'Sala no disponible';end if;
 if p_butacas is null or cardinality(p_butacas) not between 1 and 8 or cardinality(p_butacas)<>(select count(distinct x) from unnest(p_butacas) x) or exists(
 select 1 from unnest(p_butacas) x where not exists(select 1 from generate_series(1,s.filas) a cross join generate_series(1,s.columnas) b where x=chr(64+a)||b::text)) then raise exception 'Seleccioná de 1 a 8 butacas válidas';end if;
 if (select count(distinct left(x,1)) from unnest(p_butacas) x)<>1 or (select max(substring(x from 2)::integer)-min(substring(x from 2)::integer)+1 from unnest(p_butacas) x)<>cardinality(p_butacas) then raise exception 'Elegí butacas contiguas en una misma fila';end if;
 if exists(select 1 from public.cine_entradas e join public.cine_reservas r on r.id=e.reserva_id where e.funcion_id=f.id and e.activa and e.butaca=any(p_butacas) and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>now()))) then raise exception 'Una butaca ya fue reservada';end if;
 if p_candy is null or jsonb_typeof(p_candy)<>'array' then raise exception 'Candy inválido';end if;
 if jsonb_array_length(p_candy)>30 then raise exception 'Demasiados productos';end if;
 if exists(select 1 from jsonb_array_elements(p_candy) a group by a->>'tipo',a->>'id' having count(*)>1) then raise exception 'Productos duplicados';end if;
 sub:=f.precio*cardinality(p_butacas);
 for v_item in select value from jsonb_array_elements(p_candy) loop
 qty:=(v_item->>'cantidad')::integer;
 if qty is null or qty not between 1 and 20 then raise exception 'Cantidad inválida';end if;
 if v_item->>'tipo'='producto' then
 select * into p from public.cine_productos where id=(v_item->>'id')::uuid and activo;
 if not found then raise exception 'Producto no disponible';end if;
 sub:=sub+p.precio*qty;
 detalle:=detalle||jsonb_build_array(jsonb_build_object('nombre',p.nombre,'cantidad',qty,'precio',p.precio,'tipo','producto'));
 consumo:=consumo||jsonb_build_array(jsonb_build_object('id',p.id,'cantidad',qty));
 elsif v_item->>'tipo'='combo' then
 select * into c from public.cine_combos where id=(v_item->>'id')::uuid and activo;
 if not found or not exists(select 1 from public.cine_combo_items where combo_id=c.id) then raise exception 'Combo no disponible';end if;
 sub:=sub+c.precio*qty;
 detalle:=detalle||jsonb_build_array(jsonb_build_object('nombre',c.nombre,'cantidad',qty,'precio',c.precio,'tipo','combo','items',(select jsonb_agg(jsonb_build_object('nombre',producto.nombre,'cantidad',i.cantidad)) from public.cine_combo_items i join public.cine_productos producto on producto.id=i.producto_id where i.combo_id=c.id)));
 consumo:=consumo||(select jsonb_agg(jsonb_build_object('id',producto_id,'cantidad',cantidad*qty)) from public.cine_combo_items where combo_id=c.id);
 else raise exception 'Tipo de candy inválido';end if;
 end loop;
 consumo:=coalesce((select jsonb_agg(jsonb_build_object('id',id,'cantidad',cantidad)) from(select a->>'id' id,sum((a->>'cantidad')::integer) cantidad from jsonb_array_elements(consumo) a group by a->>'id') t),'[]');
 for v_item in select value from jsonb_array_elements(consumo) loop
 select * into p from public.cine_productos where id=(v_item->>'id')::uuid and activo;
 if not found then raise exception 'Producto de combo no disponible';end if;
 select coalesce(sum((a->>'cantidad')::integer),0) into stock_reservado from public.cine_reservas r cross join lateral jsonb_array_elements(r.stock_items) a where r.estado='pendiente' and r.vence>now() and a->>'id'=p.id::text;
 if p.stock-stock_reservado<(v_item->>'cantidad')::integer then raise exception 'Stock insuficiente: %',p.nombre;end if;
 end loop;
 if nullif(trim(p_cupon),'') is not null then
 select * into cu from public.cine_cupones where codigo=upper(trim(p_cupon)) and activo and desde<=now() and hasta>now();
 if not found then raise exception 'Cupón inválido o vencido';end if;
 if sub<cu.minimo or (cu.pelicula_id is not null and cu.pelicula_id<>f.pelicula_id) or (cu.usuario_id is not null and cu.usuario_id is distinct from auth.uid()) or (cu.solo_registrados and auth.uid() is null) then raise exception 'No cumplís las condiciones del cupón';end if;
 if (select count(*) from public.cine_reservas where cupon_id=cu.id and (estado='confirmada' or (estado='cancelada' and confirmada_por is not null) or (estado='pendiente' and vence>now())))>=cu.limite then raise exception 'Cupón agotado';end if;
 des:=round(sub*cu.porcentaje/100,2);
 end if;
 total:=sub-des;
 if p_credito is null or p_credito<0 or p_credito<>round(p_credito,2) or p_credito>total then raise exception 'Crédito inválido';end if;
 if p_credito>0 then
 if auth.uid() is null then raise exception 'Iniciá sesión para usar crédito';end if;
 disponible:=(public.cine_saldos(auth.uid())->>'credito_disponible')::numeric;
 if p_credito>disponible then raise exception 'Saldo de crédito insuficiente';end if;
 end if;
 return jsonb_build_object('subtotal',sub,'descuento',des,'total',total,'credito',p_credito,'a_pagar',total-p_credito,'candy',detalle,'stock_items',consumo,'cupon_id',cu.id);
end $$;

create function public.cine_cotizar(p_funcion uuid,p_butacas text[],p_candy jsonb,p_cupon text,p_credito numeric) returns jsonb language sql stable security definer set search_path='' as $$
 select public.cine_calcular_checkout(p_funcion,p_butacas,p_candy,p_cupon,p_credito)-'stock_items'-'cupon_id';
$$;

create function public.cine_checkout(p_funcion uuid,p_butacas text[],p_candy jsonb,p_cupon text,p_credito numeric,p_email text,p_comprador text,p_edad boolean,p_solicitud uuid,p_total_esperado numeric default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare f public.cine_funciones;r public.cine_reservas;v jsonb;pedido jsonb;v_id uuid;v_token uuid;
begin
 select * into f from public.cine_funciones where id=p_funcion for update;
 if not found then raise exception 'Función inexistente';end if;
 perform 1 from public.cine_mutex for update;
 if auth.uid() is not null and not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Perfil no disponible';end if;
 if p_solicitud is null or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_comprador is null or length(trim(p_comprador)) not between 1 and 200 then raise exception 'Completá nombre y correo válidos';end if;
 pedido:=jsonb_build_object('funcion',p_funcion,'butacas',p_butacas,'candy',p_candy,'cupon',upper(trim(coalesce(p_cupon,''))),'credito',p_credito,'email',trim(p_email),'comprador',trim(p_comprador),'edad',p_edad,'total_esperado',p_total_esperado);
 select * into r from public.cine_reservas where solicitud=p_solicitud;
 if found then
 if r.usuario_id is distinct from auth.uid() or r.pedido is distinct from pedido then raise exception 'Solicitud ya utilizada';end if;
 return r.token;end if;
 if p_edad is not true and exists(select 1 from public.peliculas where id=f.pelicula_id and clasificacion::text<>'ATP') then raise exception 'Confirmá la restricción de edad';end if;
 v:=public.cine_calcular_checkout(p_funcion,p_butacas,p_candy,p_cupon,p_credito);
 if p_total_esperado is not null and p_total_esperado<>(v->>'total')::numeric then raise exception 'El precio cambió. Volvé a calcular y revisar el total';end if;
 update public.cine_entradas e set activa=false from public.cine_reservas vencida where vencida.id=e.reserva_id and e.funcion_id=f.id and vencida.estado='pendiente' and vencida.vence<=now() and e.activa;
 insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,comprador,edad_confirmada,pedido,total,subtotal,descuento,credito,cupon_id,candy,stock_items,vence)
 values(p_solicitud,f.id,auth.uid(),trim(p_email),trim(p_comprador),coalesce(p_edad,false),pedido,(v->>'total')::numeric,(v->>'subtotal')::numeric,(v->>'descuento')::numeric,p_credito,(v->>'cupon_id')::uuid,v->'candy',v->'stock_items',least(now()+interval '15 minutes',f.inicio)) returning id,token into v_id,v_token;
 insert into public.cine_entradas(reserva_id,funcion_id,butaca) select v_id,f.id,x from unnest(p_butacas) x;
 if auth.uid() is not null then insert into public.cine_notificaciones(usuario_id,mensaje) values(auth.uid(),'Reserva creada: pendiente de pago presencial.');end if;
 return v_token;
end $$;

-- Cierra el flujo antiguo, que no pedía conformidad de edad ni datos de checkout.
create or replace function public.cine_reservar(p_funcion uuid,p_butacas text[],p_email text,p_solicitud uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin raise exception 'Completá el checkout para reservar';end $$;

create or replace function public.cine_disponibilidad(p_funcion uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.cine_funciones;s public.cine_salas;
begin
 select * into f from public.cine_funciones where id=p_funcion and activa and inicio>now();
 if not found or not exists(select 1 from public.peliculas where id=f.pelicula_id and activa) then raise exception 'Función no disponible';end if;
 select * into s from public.cine_salas where id=f.sala_id and activa;
 if not found then raise exception 'Sala no disponible';end if;
 return jsonb_build_object('funcion',to_jsonb(f),'sala',to_jsonb(s),'ocupadas',coalesce((select jsonb_agg(e.butaca) from public.cine_entradas e join public.cine_reservas r on r.id=e.reserva_id where e.funcion_id=f.id and e.activa and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>now()))),'[]'));
end $$;

create or replace function public.cine_comprobante(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.cine_reservas;
begin
 select * into r from public.cine_reservas where token=p_token;
 if not found then raise exception 'Reserva inexistente';end if;
 return jsonb_build_object('token',r.token,'estado',case when r.estado='pendiente' and r.vence<=now() then 'vencida' else r.estado end,'total',r.total,'subtotal',coalesce(r.subtotal,r.total),'descuento',r.descuento,'credito',r.credito,'a_pagar',r.total-r.credito,'vence',r.vence,'funcion',(select to_jsonb(f) from public.cine_funciones f where f.id=r.funcion_id),'candy',r.candy,'candy_codigo',r.candy_codigo,'candy_usada_en',r.candy_usada_en,
 'entradas',coalesce((select jsonb_agg(jsonb_build_object('butaca',butaca,'codigo',codigo,'usada_en',usada_en) order by butaca) from public.cine_entradas where reserva_id=r.id),'[]'));
end $$;

create or replace function public.cine_confirmar_reserva(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;f public.cine_funciones;x jsonb;
begin
 if not public.cine_rol(array['empleado','administrador']) then raise exception 'Acceso denegado';end if;
 select * into r from public.cine_reservas where token=p_token;
 if not found then raise exception 'Reserva inexistente';end if;
 select * into f from public.cine_funciones where id=r.funcion_id for update;
 perform 1 from public.cine_mutex for update;
 select * into r from public.cine_reservas where token=p_token for update;
 if r.estado='confirmada' then return public.cine_comprobante(p_token);end if;
 if r.estado<>'pendiente' or r.vence<=clock_timestamp() or f.inicio<=clock_timestamp() or not f.activa then raise exception 'Reserva vencida, cancelada o función no disponible';end if;
 if not exists(select 1 from public.peliculas where id=f.pelicula_id and activa) or not exists(select 1 from public.cine_salas where id=f.sala_id and activa) then raise exception 'Película o sala no disponible';end if;
 if r.usuario_id is not null and not exists(select 1 from public.perfiles where id=r.usuario_id and activo) then raise exception 'Comprador inactivo';end if;
 if r.cupon_id is not null and not exists(select 1 from public.cine_cupones cupon where cupon.id=r.cupon_id and cupon.activo and cupon.desde<=clock_timestamp() and cupon.hasta>clock_timestamp() and r.subtotal>=cupon.minimo and (cupon.pelicula_id is null or cupon.pelicula_id=f.pelicula_id) and (cupon.usuario_id is null or cupon.usuario_id=r.usuario_id) and (not cupon.solo_registrados or r.usuario_id is not null)) then raise exception 'El cupón dejó de ser válido. Creá una nueva reserva';end if;
 for x in select value from jsonb_array_elements(r.stock_items) loop
 update public.cine_productos set stock=stock-(x->>'cantidad')::integer where id=(x->>'id')::uuid and activo and stock>=(x->>'cantidad')::integer;
 if not found then raise exception 'Stock insuficiente';end if;end loop;
 if r.credito>0 then
 if (public.cine_saldos(r.usuario_id)->>'credito')::numeric<r.credito then raise exception 'Crédito insuficiente';end if;
 insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(r.usuario_id,'credito',-r.credito,'Compra',r.id);end if;
 update public.cine_reservas set estado='confirmada',confirmada_por=auth.uid(),puntos=case when usuario_id is not null then floor(total-credito)::integer else 0 end where id=r.id returning * into r;
 if r.usuario_id is not null then
 if r.puntos>0 then insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(r.usuario_id,'puntos',r.puntos,'Compra',r.id);end if;
 insert into public.cine_notificaciones(usuario_id,mensaje) values(r.usuario_id,'Pago presencial confirmado. Tus entradas están habilitadas.');end if;
 return public.cine_comprobante(p_token);
end $$;

create function public.cine_cancelar(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;f public.cine_funciones;x jsonb;
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
 select * into r from public.cine_reservas where token=p_token and usuario_id=auth.uid();
 if not found then raise exception 'Reserva no disponible';end if;
 select * into f from public.cine_funciones where id=r.funcion_id for update;
 perform 1 from public.cine_mutex for update;
 select * into r from public.cine_reservas where token=p_token for update;
 if r.estado='cancelada' then return;end if;
 -- Se mide DESPUÉS de adquirir locks: un canje concurrente no puede liberar
 -- puntos al cruzar el plazo mientras una cancelación espera el mutex.
 if f.inicio<clock_timestamp()+interval '2 hours' or r.candy_usada_en is not null or exists(select 1 from public.cine_entradas where reserva_id=r.id and usada_en is not null) then raise exception 'Solo podés cancelar hasta dos horas antes, sin prestaciones utilizadas';end if;
 if r.estado='pendiente' and r.vence<=now() then raise exception 'La reserva ya venció';end if;
 if r.estado='confirmada' then
 insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(auth.uid(),'credito',r.total,'Cancelación',r.id);
 if r.puntos>0 then insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(auth.uid(),'puntos',-r.puntos,'Cancelación',r.id);end if;
 for x in select value from jsonb_array_elements(r.stock_items) loop update public.cine_productos set stock=stock+(x->>'cantidad')::integer where id=(x->>'id')::uuid;end loop;
 end if;
 update public.cine_reservas set estado='cancelada' where id=r.id;
 update public.cine_entradas set activa=false where reserva_id=r.id;
 insert into public.cine_notificaciones(usuario_id,mensaje) values(auth.uid(),'Reserva cancelada. Si estaba pagada, el importe se convirtió en crédito (sin devolución monetaria).');
end $$;

create function public.cine_canjear(p_recompensa uuid,p_solicitud uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.cine_recompensas;c public.cine_canjes;v_cupon uuid;v_id uuid;
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) or p_solicitud is null then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_mutex for update;
 select * into c from public.cine_canjes where solicitud=p_solicitud;
 if found then if c.usuario_id<>auth.uid() or c.recompensa_id<>p_recompensa then raise exception 'Solicitud ya utilizada';end if;return;end if;
 select * into r from public.cine_recompensas where id=p_recompensa and activa and desde<=now() and hasta>now();
 if not found then raise exception 'Recompensa no disponible';end if;
 if (public.cine_saldos(auth.uid())->>'puntos_disponibles')::numeric<r.puntos then raise exception 'Puntos disponibles insuficientes';end if;
 insert into public.cine_cupones(codigo,porcentaje,desde,hasta,limite,usuario_id,solo_registrados) values('CANJE-'||upper(gen_random_uuid()::text),r.porcentaje,now(),r.hasta,1,auth.uid(),true) returning id into v_cupon;
 insert into public.cine_canjes(usuario_id,recompensa_id,nombre,puntos,cupon_id,solicitud) values(auth.uid(),r.id,r.nombre,r.puntos,v_cupon,p_solicitud) returning id into v_id;
 insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,canje_id) values(auth.uid(),'puntos',-r.puntos,'Canje',v_id);
 insert into public.cine_notificaciones(usuario_id,mensaje) values(auth.uid(),'Canje realizado: el cupón está disponible en Mis canjes.');
end $$;

create function public.cine_mis_beneficios() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
 -- Bandeja interna: materializa estrenos al consultar, sin cron, email ni push.
 insert into public.cine_notificaciones(usuario_id,mensaje,clave)
 select a.usuario_id,'Ya está estrenada: '||p.titulo,'estreno:'||p.id::text||':'||p.fecha_estreno::text
 from public.cine_alertas a join public.peliculas p on p.id=a.pelicula_id
 where a.usuario_id=auth.uid() and p.activa and p.fecha_estreno<=current_date
 on conflict(usuario_id,clave) do nothing;
 return public.cine_saldos(auth.uid())||jsonb_build_object(
 'movimientos',coalesce((select jsonb_agg(to_jsonb(m)-'usuario_id' order by creada desc) from public.cine_movimientos m where usuario_id=auth.uid()),'[]'),
 'recompensas',coalesce((select jsonb_agg(to_jsonb(r) order by puntos) from public.cine_recompensas r where activa and desde<=now() and hasta>now()),'[]'),
 'canjes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre,'puntos',c.puntos,'creada',c.creada,'codigo',cu.codigo,'hasta',cu.hasta,'usado',exists(select 1 from public.cine_reservas where cupon_id=cu.id and (estado='confirmada' or (estado='cancelada' and confirmada_por is not null)))) order by c.creada desc) from public.cine_canjes c join public.cine_cupones cu on cu.id=c.cupon_id where c.usuario_id=auth.uid()),'[]'),
 'notificaciones',coalesce((select jsonb_agg(to_jsonb(n)-'usuario_id' order by creada desc) from public.cine_notificaciones n where usuario_id=auth.uid()),'[]'),
 'alertas',coalesce((select jsonb_agg(jsonb_build_object('pelicula_id',a.pelicula_id,'titulo',p.titulo)) from public.cine_alertas a join public.peliculas p on p.id=a.pelicula_id where a.usuario_id=auth.uid()),'[]'));
end $$;

create function public.cine_marcar_leida(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
 update public.cine_notificaciones set leida=true where id=p_id and usuario_id=auth.uid();if not found then raise exception 'Notificación no disponible';end if;
end $$;
create function public.cine_alerta(p_pelicula uuid,p_activa boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
 if p_activa then
 if not exists(select 1 from public.peliculas where id=p_pelicula and activa) then raise exception 'Película no disponible';end if;
 insert into public.cine_alertas(usuario_id,pelicula_id) values(auth.uid(),p_pelicula) on conflict do nothing;
 else delete from public.cine_alertas where usuario_id=auth.uid() and pelicula_id=p_pelicula;end if;
end $$;
create function public.cine_notificar_funcion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.activa and (tg_op='INSERT' or not old.activa) then
 insert into public.cine_notificaciones(usuario_id,mensaje) select a.usuario_id,'Nueva función disponible: '||p.titulo||' · '||new.inicio::text from public.cine_alertas a join public.peliculas p on p.id=a.pelicula_id where a.pelicula_id=new.pelicula_id;end if;
 return null;
end $$;
create trigger cine_alerta_funcion after insert or update on public.cine_funciones for each row execute function public.cine_notificar_funcion();

create function public.cine_escribir_resena(p_token uuid,p_calificacion integer,p_texto text) returns void language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;v_pelicula uuid;v_nombre text;
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado';end if;
 select * into r from public.cine_reservas where token=p_token and usuario_id=auth.uid() and estado='confirmada';
 if not found or not exists(select 1 from public.cine_entradas where reserva_id=r.id and usada_en is not null) then raise exception 'Solo podés reseñar una película con entrada utilizada';end if;
 if p_calificacion is null or p_calificacion not between 1 and 5 or p_texto is null or length(trim(p_texto)) not between 1 and 2000 then raise exception 'Calificación o reseña inválida';end if;
 select pelicula_id into v_pelicula from public.cine_funciones where id=r.funcion_id;
 select coalesce(nullif(trim(nombre),''),'Cliente') into v_nombre from public.perfiles where id=auth.uid();
 insert into public.cine_resenas(usuario_id,reserva_id,pelicula_id,nombre,calificacion,texto) values(auth.uid(),r.id,v_pelicula,v_nombre,p_calificacion,trim(p_texto))
 on conflict(usuario_id,reserva_id) do update set calificacion=excluded.calificacion,texto=excluded.texto;
end $$;
create function public.cine_resenas_publicas(p_pelicula uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('promedio',coalesce((select round(avg(calificacion),1) from public.cine_resenas where pelicula_id=p_pelicula),0),'resenas',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'calificacion',calificacion,'texto',texto,'creada',creada) order by creada desc) from public.cine_resenas where pelicula_id=p_pelicula),'[]'));
$$;

-- Un mismo escáner sirve para entrada, candy y cupones de canje: prestaciones separadas.
create function public.cine_validar_prestacion(p_codigo uuid,p_tipo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;f public.cine_funciones;e public.cine_entradas;resultado jsonb;motivo text;
begin
 if not public.cine_rol(array['empleado','administrador']) then raise exception 'Acceso denegado';end if;
 begin
 if p_tipo='entrada' then
 select * into e from public.cine_entradas where codigo=p_codigo;
 if not found then raise exception 'Entrada inexistente';end if;
 select * into f from public.cine_funciones where id=e.funcion_id for update;
 select * into e from public.cine_entradas where codigo=p_codigo for update;
 select * into r from public.cine_reservas where id=e.reserva_id;
 if not e.activa or r.estado<>'confirmada' then raise exception 'Entrada no habilitada';end if;
 if e.usada_en is not null then raise exception 'Entrada ya utilizada';end if;
 if not f.activa or now()<f.inicio-interval '30 minutes' or now()>f.fin then raise exception 'Fuera del horario de ingreso';end if;
 update public.cine_entradas set usada_en=now(),usada_por=auth.uid() where id=e.id;
 resultado:=jsonb_build_object('ok',true,'mensaje','Ingreso autorizado','butaca',e.butaca,'funcion',f.id);
 elsif p_tipo='candy' then
 select * into r from public.cine_reservas where candy_codigo=p_codigo;
 if not found then raise exception 'Código de candy inexistente';end if;
 select * into f from public.cine_funciones where id=r.funcion_id for update;
 select * into r from public.cine_reservas where candy_codigo=p_codigo for update;
 if r.estado<>'confirmada' or jsonb_array_length(r.candy)=0 then raise exception 'Candy no habilitado';end if;
 if r.candy_usada_en is not null then raise exception 'Candy ya retirado';end if;
 if not f.activa or now()<f.inicio-interval '30 minutes' or now()>f.fin then raise exception 'Fuera del horario de retiro';end if;
 update public.cine_reservas set candy_usada_en=now(),candy_usada_por=auth.uid() where id=r.id;
 resultado:=jsonb_build_object('ok',true,'mensaje','Retiro autorizado','candy',r.candy);
 else raise exception 'Prestación inválida';end if;
 if r.usuario_id is not null then insert into public.cine_notificaciones(usuario_id,mensaje) values(r.usuario_id,case when p_tipo='entrada' then 'Entrada validada: butaca '||e.butaca else 'Candy retirado.' end);end if;
 exception when raise_exception then motivo:=sqlerrm;resultado:=jsonb_build_object('ok',false,'mensaje',motivo);
 end;
 insert into public.cine_validaciones(empleado_id,codigo,prestacion,resultado) values(auth.uid(),p_codigo,coalesce(p_tipo,''),resultado->>'mensaje');
 return resultado;
end $$;
create or replace function public.cine_validar_entrada(p_codigo uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.cine_validar_prestacion(p_codigo,'entrada');
$$;

-- Auditoría económica independiente del esquema de auditoría previo.
create table public.cine_auditoria(id bigint generated always as identity primary key,tabla text not null,operacion text not null,usuario_id uuid,registro jsonb,creada timestamptz not null default now());
alter table public.cine_auditoria enable row level security;
revoke all on public.cine_auditoria from anon,authenticated;
create function public.cine_auditar() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.cine_auditoria(tabla,operacion,usuario_id,registro) values(tg_table_name,tg_op,auth.uid(),to_jsonb(new));return null;end $$;
create trigger cine_reservas_audit after insert or update on public.cine_reservas for each row execute function public.cine_auditar();
create trigger cine_movimientos_audit after insert on public.cine_movimientos for each row execute function public.cine_auditar();
create trigger cine_canjes_audit after insert on public.cine_canjes for each row execute function public.cine_auditar();

do $$ declare f record;begin
 for f in select oid::regprocedure firma,proname from pg_proc where pronamespace='public'::regnamespace and proname in
 ('cine_saldos','cine_candy_catalogo','cine_calcular_checkout','cine_cotizar','cine_checkout','cine_cancelar','cine_canjear','cine_mis_beneficios','cine_marcar_leida','cine_alerta','cine_notificar_funcion','cine_escribir_resena','cine_resenas_publicas','cine_validar_prestacion','cine_auditar') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.firma);
 if f.proname not in ('cine_saldos','cine_calcular_checkout','cine_notificar_funcion','cine_auditar') then execute format('grant execute on function %s to authenticated',f.firma);end if;
 if f.proname in ('cine_candy_catalogo','cine_cotizar','cine_checkout','cine_resenas_publicas') then execute format('grant execute on function %s to anon',f.firma);end if;
 end loop;
end $$;
commit;
