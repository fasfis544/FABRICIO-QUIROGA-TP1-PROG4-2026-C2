-- Aplicar después de la alineación y administración ya instaladas.
-- Solo cambia la acumulación de NUEVAS compras; no recalcula puntos históricos.
begin;

create or replace function public.cine_comprar_documento(p_usuario uuid,p_datos jsonb,p_qr uuid,p_pdf text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.cine_reservas;v jsonb;token uuid;bs text[];x jsonb;f uuid;pedido jsonb;
begin
  perform set_config('request.jwt.claim.sub',coalesce(p_usuario::text,''),true);
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
    return r.token;
  end if;
  if p_qr is null or p_pdf is null or length(p_pdf) not between 20 and 500000 then raise exception 'Comprobante no generado';end if;
  if p_usuario is null and coalesce((p_datos->>'edad')::boolean,false) is not true and exists(select 1 from public.peliculas p join public.cine_funciones fu on fu.pelicula_id=p.id where fu.id=f and p.clasificacion::text<>'ATP') then raise exception 'Confirmá la edad mínima';end if;
  v:=public.cine_calcular_checkout(f,bs,p_datos->'candy',p_datos->>'cupon',(p_datos->>'credito')::numeric);
  if p_datos->'cotizacion' is distinct from (v-'stock_items'-'cupon_id') then raise exception 'El precio o los datos cambiaron. Volvé a cotizar';end if;
  if nullif(trim(p_datos->>'email'),'') is null or length(p_datos->>'email')>254 or p_datos->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo inválido';end if;
  update public.cine_entradas e set activa=false from public.cine_reservas vencida where vencida.id=e.reserva_id and e.funcion_id=f and vencida.estado='pendiente' and vencida.vence<=now() and e.activa;
  insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,comprador,edad_confirmada,pedido,total,subtotal,descuento,credito,cupon_id,candy,stock_items,vence,estado,puntos,confirmada_por,qr_compra,pago_simulado,documento_pdf,comprobante_emitido)
  values((p_datos->>'solicitud')::uuid,f,p_usuario,trim(p_datos->>'email'),trim(coalesce(p_datos->>'nombre','Invitado')),coalesce((p_datos->>'edad')::boolean,false),pedido,(v->>'total')::numeric,(v->>'subtotal')::numeric,(v->>'descuento')::numeric,(v->>'credito')::numeric,(v->>'cupon_id')::uuid,v->'candy',v->'stock_items',now(),'confirmada',case when p_usuario is null then 0 else floor((v->>'a_pagar')::numeric / 8)::integer end,p_usuario,p_qr,true,p_pdf,v-'stock_items'-'cupon_id') returning * into r;
  insert into public.cine_entradas(reserva_id,funcion_id,butaca,precio) select r.id,f,b->>'butaca',(b->>'precio')::numeric from jsonb_array_elements(v->'entradas') b;
  for x in select value from jsonb_array_elements(r.stock_items) loop
    update public.cine_productos set stock=stock-(x->>'cantidad')::integer where id=(x->>'id')::uuid and activo and stock>=(x->>'cantidad')::integer;
    if not found then raise exception 'Stock insuficiente';end if;
  end loop;
  if p_usuario is not null then
    if r.credito>0 then insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(p_usuario,'credito',-r.credito,'Compra',r.id);end if;
    if r.puntos>0 then insert into public.cine_movimientos(usuario_id,tipo,importe,motivo,reserva_id) values(p_usuario,'puntos',r.puntos,'Compra',r.id);end if;
    insert into public.cine_notificaciones(usuario_id,mensaje) values(p_usuario,'Compra confirmada con pago simulado (sin cargo real). Comprobante y QR disponibles.');
  end if;
  return r.token;
end $$;

revoke all on function public.cine_comprar_documento(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.cine_comprar_documento(uuid,jsonb,uuid,text) to service_role;

commit;
