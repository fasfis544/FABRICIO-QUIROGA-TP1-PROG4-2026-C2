-- Aplicar UNA VEZ después de 20261010000100_administracion_operativa.sql.
-- Solo instala protección de futuras escrituras. No adapta ni modifica filas existentes.
begin;

-- Conserva todas las validaciones y la compatibilidad activo/activa de la RPC actual.
alter function public.cine_guardar_pelicula(jsonb,uuid[]) rename to cine_guardar_pelicula_integridad_base;
revoke all on function public.cine_guardar_pelicula_integridad_base(jsonb,uuid[]) from public,anon,authenticated,service_role;

create function public.cine_guardar_pelicula(p_datos jsonb,p_generos uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_duracion integer;v_anterior integer;v uuid;v_ahora timestamptz;
begin
  if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
  v_id:=(p_datos->>'id')::uuid;
  v_duracion:=(p_datos->>'duracion_minutos')::integer;
  if v_duracion is null or v_duracion not between 1 and 600 then raise exception 'Duración permitida: entre 1 y 600 minutos';end if;

  -- Orden compartido con creación, reprogramación y compra: salas, funciones, mutex.
  -- Bloquear las salas antes de leer evita altas/lotes/reprogramaciones durante el recalculo.
  perform 1 from public.cine_salas order by id for update;
  perform 1 from public.cine_funciones where pelicula_id=v_id and activa order by id for update;
  perform 1 from public.cine_mutex for update;
  if v_id is not null then
    select duracion_minutos into v_anterior from public.peliculas where id=v_id for update;
    if not found then raise exception 'Película inexistente';end if;
  end if;
  v_ahora:=clock_timestamp();
  if v_id is not null and v_duracion is distinct from v_anterior then
    if exists(select 1 from public.cine_funciones where pelicula_id=v_id and activa and inicio<=v_ahora and fin>v_ahora) then
      raise exception 'No se puede cambiar la duración con una función en curso';
    end if;
    if exists(
      select 1 from public.cine_funciones f join public.cine_reservas r on r.funcion_id=f.id
      where f.pelicula_id=v_id and f.activa and f.inicio>v_ahora
        and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>v_ahora))
    ) then raise exception 'No se puede cambiar la duración con compras o reservas vigentes en funciones futuras';end if;
    if exists(
      select 1 from public.cine_funciones f join public.cine_funciones otra on otra.sala_id=f.sala_id and otra.id<>f.id
      where f.pelicula_id=v_id and f.activa and f.inicio>v_ahora and otra.activa
        and otra.inicio<f.inicio+(v_duracion+30)*interval '1 minute'
        and (case when otra.pelicula_id=v_id and otra.inicio>v_ahora
          then otra.inicio+(v_duracion+30)*interval '1 minute' else otra.fin end)>f.inicio
    ) then raise exception 'La nueva duración superpone funciones o no respeta los 30 minutos de limpieza';end if;
  end if;

  v:=public.cine_guardar_pelicula_integridad_base(p_datos,p_generos);
  if v_id is not null and v_duracion is distinct from v_anterior then
    -- Actualizar únicamente funciones activas que todavía no empezaron. Todo se revierte si falla.
    update public.cine_funciones set fin=inicio+(v_duracion+30)*interval '1 minute'
    where pelicula_id=v_id and activa and inicio>v_ahora;
    insert into public.cine_auditoria(tabla,operacion,usuario_id,registro)
    values('peliculas','AJUSTAR_DURACION',auth.uid(),jsonb_build_object('id',v_id,'duracion_anterior',v_anterior,'duracion',v_duracion));
  end if;
  return v;
end $$;

-- Retira el bypass de UPDATE directo legado: la app guarda por la RPC protegida.
-- No borra políticas, filas, asociaciones ni permisos de lectura.
revoke update on public.peliculas from public,anon,authenticated;
revoke update(duracion_minutos) on public.peliculas from public,anon,authenticated;

create or replace function public.cine_editar_funcion(p_id uuid,p_precio numeric,p_idioma text,p_formato text,p_vip numeric) returns void
language plpgsql security definer set search_path='' as $$
declare f public.cine_funciones;v_ahora timestamptz;
begin
  if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
  select * into f from public.cine_funciones where id=p_id for update;
  if not found or not f.activa then raise exception 'Función futura activa inexistente';end if;
  perform 1 from public.cine_mutex for update;
  v_ahora:=clock_timestamp();
  if f.inicio<=v_ahora then raise exception 'Solo se pueden editar funciones futuras';end if;
  if p_precio is null or p_precio<=0 or p_precio::text in('NaN','Infinity','-Infinity') then raise exception 'El precio debe ser un importe positivo válido';end if;
  if p_vip is null or p_vip<=0 or p_vip>500 or p_vip::text in('NaN','Infinity','-Infinity') then raise exception 'Recargo VIP permitido: mayor a 0 y hasta 500%%';end if;
  if p_idioma is null or p_idioma not in('castellano','subtitulada') or p_formato is null or p_formato not in('2D','3D','4D','5D') then raise exception 'Seleccioná idioma y formato válidos';end if;
  if (p_idioma is distinct from f.idioma or p_formato is distinct from f.formato) and exists(
    select 1 from public.cine_reservas where funcion_id=f.id
      and (estado='confirmada' or (estado='pendiente' and vence>v_ahora))
  ) then raise exception 'No se puede cambiar idioma o formato con compras o reservas vigentes';end if;
  update public.cine_funciones set precio=p_precio,idioma=p_idioma,formato=p_formato,vip_porcentaje=p_vip where id=f.id;
end $$;

create or replace function public.cine_crear_funcion(p_pelicula uuid,p_sala uuid,p_inicio timestamptz,p_precio numeric,p_idioma text default null,p_formato text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.cine_salas;v uuid;dur integer;v_fin timestamptz;
begin
  if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
  perform 1 from public.cine_salas order by id for update;
  if p_inicio is null or not isfinite(p_inicio) then raise exception 'Ingresá una fecha y hora válidas';end if;
  if p_inicio<=clock_timestamp() then raise exception 'La fecha y hora de inicio deben ser futuras';end if;
  if p_precio is null or p_precio<=0 or p_precio::text in('NaN','Infinity','-Infinity') then raise exception 'El precio debe ser un importe positivo válido';end if;
  if p_idioma is null or p_idioma not in('castellano','subtitulada') or p_formato is null or p_formato not in('2D','3D','4D','5D') then raise exception 'Seleccioná idioma y formato válidos';end if;
  select duracion_minutos into dur from public.peliculas where id=p_pelicula and activa and fecha_estreno<=(p_inicio at time zone 'America/Argentina/Buenos_Aires')::date;
  if not found then raise exception 'Película no disponible para esa fecha';end if;
  v_fin:=p_inicio+(dur+30)*interval '1 minute';
  for s in select * from public.cine_salas where activa and distribucion_documento order by nombre,id loop
    if not exists(select 1 from public.cine_funciones where sala_id=s.id and activa and inicio<v_fin and fin>p_inicio) then
      insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio,idioma,formato)
      values(p_pelicula,s.id,p_inicio,v_fin,p_precio,p_idioma,p_formato) returning id into v;
      return v;
    end if;
  end loop;
  raise exception 'No hay una sala adaptada disponible en ese horario';
end $$;

revoke all on function public.cine_guardar_pelicula(jsonb,uuid[]),public.cine_editar_funcion(uuid,numeric,text,text,numeric),public.cine_crear_funcion(uuid,uuid,timestamptz,numeric,text,text) from public,anon,authenticated;
grant execute on function public.cine_guardar_pelicula(jsonb,uuid[]),public.cine_editar_funcion(uuid,numeric,text,text,numeric),public.cine_crear_funcion(uuid,uuid,timestamptz,numeric,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
