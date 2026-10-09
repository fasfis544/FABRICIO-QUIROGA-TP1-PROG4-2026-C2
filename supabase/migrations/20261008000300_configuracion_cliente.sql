-- Configuración desde administración de los catálogos usados por el cliente.
begin;
create function public.cine_ofertas_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 return jsonb_build_object('productos',coalesce((select jsonb_agg(to_jsonb(p) order by nombre) from public.cine_productos p),'[]'),
 'combos',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)) from public.cine_combo_items i where combo_id=c.id),'[]')) order by nombre) from public.cine_combos c),'[]'),
 'cupones',coalesce((select jsonb_agg(to_jsonb(c) order by codigo) from public.cine_cupones c where usuario_id is null),'[]'),
 'recompensas',coalesce((select jsonb_agg(to_jsonb(r) order by nombre) from public.cine_recompensas r),'[]'));
end $$;
create function public.cine_guardar_oferta(p_tipo text,p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce((p_datos->>'id')::uuid,gen_random_uuid());p public.cine_productos;c public.cine_combos;cu public.cine_cupones;r public.cine_recompensas;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 perform 1 from public.cine_mutex for update;
 if p_tipo='producto' then
 select * into p from jsonb_populate_record(null::public.cine_productos,p_datos);
 if p.stock<(select coalesce(sum((i->>'cantidad')::integer),0) from public.cine_reservas reserva cross join lateral jsonb_array_elements(reserva.stock_items) i where reserva.estado='pendiente' and reserva.vence>now() and i->>'id'=v_id::text) then raise exception 'El stock no puede ser menor que el retenido por reservas';end if;
 insert into public.cine_productos(id,nombre,precio,stock,activo) values(v_id,trim(p.nombre),p.precio,p.stock,p.activo)
 on conflict(id) do update set nombre=excluded.nombre,precio=excluded.precio,stock=excluded.stock,activo=excluded.activo;
 elsif p_tipo='combo' then
 select * into c from jsonb_populate_record(null::public.cine_combos,p_datos);
 if p_datos->'items' is null or jsonb_typeof(p_datos->'items')<>'array' or jsonb_array_length(p_datos->'items') not between 1 and 20 then raise exception 'Un combo necesita entre 1 y 20 componentes';end if;
 insert into public.cine_combos(id,nombre,precio,activo) values(v_id,trim(c.nombre),c.precio,c.activo) on conflict(id) do update set nombre=excluded.nombre,precio=excluded.precio,activo=excluded.activo;
 delete from public.cine_combo_items where combo_id=v_id;
 insert into public.cine_combo_items(combo_id,producto_id,cantidad) select v_id,(i->>'producto_id')::uuid,(i->>'cantidad')::integer from jsonb_array_elements(p_datos->'items') i;
 elsif p_tipo='cupon' then
 select * into cu from jsonb_populate_record(null::public.cine_cupones,p_datos);
 if exists(select 1 from public.cine_cupones where id=v_id and usuario_id is not null) then raise exception 'Un cupón personal de canje no se edita';end if;
 if nullif(trim(cu.codigo),'') is null or length(cu.codigo)>100 then raise exception 'Código inválido';end if;
 insert into public.cine_cupones(id,codigo,porcentaje,minimo,desde,hasta,limite,pelicula_id,solo_registrados,activo)
 values(v_id,upper(trim(cu.codigo)),cu.porcentaje,cu.minimo,cu.desde,cu.hasta,cu.limite,cu.pelicula_id,cu.solo_registrados,cu.activo)
 on conflict(id) do update set codigo=excluded.codigo,porcentaje=excluded.porcentaje,minimo=excluded.minimo,desde=excluded.desde,hasta=excluded.hasta,limite=excluded.limite,pelicula_id=excluded.pelicula_id,solo_registrados=excluded.solo_registrados,activo=excluded.activo;
 elsif p_tipo='recompensa' then
 select * into r from jsonb_populate_record(null::public.cine_recompensas,p_datos);
 insert into public.cine_recompensas(id,nombre,puntos,porcentaje,desde,hasta,activa) values(v_id,trim(r.nombre),r.puntos,r.porcentaje,r.desde,r.hasta,r.activa)
 on conflict(id) do update set nombre=excluded.nombre,puntos=excluded.puntos,porcentaje=excluded.porcentaje,desde=excluded.desde,hasta=excluded.hasta,activa=excluded.activa;
 else raise exception 'Tipo de oferta inválido';end if;
 insert into public.cine_auditoria(tabla,operacion,usuario_id,registro) values('oferta_'||p_tipo,'GUARDAR',auth.uid(),p_datos||jsonb_build_object('id',v_id));
 return v_id;
end $$;

-- Conserva la validación del catálogo previo y añade idioma/formato.
alter function public.cine_guardar_pelicula(jsonb,uuid[]) rename to cine_guardar_pelicula_base;
revoke all on function public.cine_guardar_pelicula_base(jsonb,uuid[]) from public,anon,authenticated;
create function public.cine_guardar_pelicula(p_datos jsonb,p_generos uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_idioma text;v_formato text;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 v_id:=public.cine_guardar_pelicula_base(p_datos,p_generos);
 if p_datos ? 'idioma' or p_datos ? 'formato' then
 select coalesce(p_datos->>'idioma',idioma),coalesce(p_datos->>'formato',formato) into v_idioma,v_formato from public.peliculas where id=v_id;
 if length(trim(v_idioma)) not between 1 and 60 or length(trim(v_formato)) not between 1 and 30 then raise exception 'Idioma o formato inválido';end if;
 update public.peliculas set idioma=trim(v_idioma),formato=trim(v_formato) where id=v_id;
 end if;
 return v_id;
end $$;
create function public.cine_notificar_estreno() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.activa and (new.fecha_estreno is distinct from old.fecha_estreno or (new.activa and not old.activa)) then
 insert into public.cine_notificaciones(usuario_id,mensaje) select usuario_id,'Novedad de estreno: '||new.titulo||' · '||new.fecha_estreno::text from public.cine_alertas where pelicula_id=new.id;end if;
 return null;
end $$;
create trigger cine_alerta_estreno after update on public.peliculas for each row execute function public.cine_notificar_estreno();
alter function public.cine_crear_funcion(uuid,uuid,timestamptz,numeric) rename to cine_crear_funcion_base;
revoke all on function public.cine_crear_funcion_base(uuid,uuid,timestamptz,numeric) from public,anon,authenticated;
create function public.cine_crear_funcion(p_pelicula uuid,p_sala uuid,p_inicio timestamptz,p_precio numeric,p_idioma text default null,p_formato text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_idioma text;v_formato text;
begin
 if not public.cine_rol(array['administrador']) then raise exception 'Acceso denegado';end if;
 select coalesce(p_idioma,idioma),coalesce(p_formato,formato) into v_idioma,v_formato from public.peliculas where id=p_pelicula;
 if v_idioma is null or v_formato is null or length(trim(v_idioma)) not between 1 and 60 or length(trim(v_formato)) not between 1 and 30 then raise exception 'Idioma o formato inválido';end if;
 v_id:=public.cine_crear_funcion_base(p_pelicula,p_sala,p_inicio,p_precio);
 update public.cine_funciones set idioma=trim(v_idioma),formato=trim(v_formato) where id=v_id;
 return v_id;
end $$;
revoke all on function public.cine_crear_funcion(uuid,uuid,timestamptz,numeric,text,text) from public,anon,authenticated;
grant execute on function public.cine_crear_funcion(uuid,uuid,timestamptz,numeric,text,text) to authenticated;
revoke all on function public.cine_ofertas_admin(),public.cine_guardar_oferta(text,jsonb),public.cine_guardar_pelicula(jsonb,uuid[]),public.cine_notificar_estreno() from public,anon,authenticated;
grant execute on function public.cine_ofertas_admin(),public.cine_guardar_oferta(text,jsonb),public.cine_guardar_pelicula(jsonb,uuid[]) to authenticated;
commit;
