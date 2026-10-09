-- Aplicar UNA VEZ después de 20261015000300. Independiente de reseña propia.
-- No borra filas, no reconstruye salas ni regraba fichas/precios/stock/vigencias.
begin;

create function public.cine_estado_catalogo(p_tipo text,p_id uuid,p_activo boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_tabla text;v_campo text;v_anterior boolean;v_ahora timestamptz;
begin
  if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
  if p_id is null or p_activo is null then raise exception 'Identificador y estado obligatorios';end if;
  -- Identificadores SQL exclusivamente de esta lista, nunca del texto recibido.
  case p_tipo
    when 'pelicula' then v_tabla:='peliculas';v_campo:='activa';
    when 'sala' then v_tabla:='cine_salas';v_campo:='activa';
    when 'producto' then v_tabla:='cine_productos';v_campo:='activo';
    when 'combo' then v_tabla:='cine_combos';v_campo:='activo';
    when 'cupon' then v_tabla:='cine_cupones';v_campo:='activo';
    when 'recompensa' then v_tabla:='cine_recompensas';v_campo:='activa';
    when 'genero' then
      v_tabla:='generos';
      select a.attname into v_campo from pg_catalog.pg_attribute a
        where a.attrelid='public.generos'::regclass and not a.attisdropped
          and a.attname in('activo','activa') order by (a.attname='activo') desc limit 1;
    else raise exception 'Tipo de catálogo inválido';
  end case;
  -- Mismo orden que programación/mantenimiento: salas, funciones, mutex, ficha.
  if p_tipo in('pelicula','sala') then
    perform 1 from public.cine_salas order by id for update;
    perform 1 from public.cine_funciones
      where (p_tipo='pelicula' and pelicula_id=p_id) or (p_tipo='sala' and sala_id=p_id)
      order by id for update;
  end if;
  perform 1 from public.cine_mutex for update;
  execute format('select %I from public.%I where id=$1 for update',v_campo,v_tabla)
    into v_anterior using p_id;
  if v_anterior is null then raise exception 'Registro inexistente';end if;
  if v_anterior=p_activo then return;end if;
  v_ahora:=clock_timestamp();
  if not p_activo and p_tipo in('pelicula','sala') and exists(
    select 1 from public.cine_funciones f join public.cine_reservas r on r.funcion_id=f.id
    where ((p_tipo='pelicula' and f.pelicula_id=p_id) or (p_tipo='sala' and f.sala_id=p_id))
      and f.fin>v_ahora
      and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>v_ahora))
  ) then raise exception 'No se puede eliminar: hay compras o reservas vigentes en funciones futuras o en curso. Gestioná primero esas funciones';end if;
  execute format('update public.%I set %I=$1 where id=$2',v_tabla,v_campo)
    using p_activo,p_id;
  insert into public.cine_auditoria(tabla,operacion,usuario_id,registro)
    values(v_tabla,case when p_activo then 'RESTAURAR_CATALOGO' else 'BAJA_CATALOGO' end,
      auth.uid(),jsonb_build_object('id',p_id,'tipo',p_tipo,'anterior',v_anterior,'activo',p_activo));
end $$;

revoke all on function public.cine_estado_catalogo(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cine_estado_catalogo(text,uuid,boolean) to authenticated;
commit;
