-- Nuevo bloque de perfil/historial. Aplicar después de las migraciones anteriores.
begin;
create function public.cine_editar_mi_perfil(p_nombre text,p_apellido text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado'; end if;
 if p_nombre is null or p_apellido is null or length(trim(p_nombre)) not between 1 and 100 or length(trim(p_apellido)) not between 1 and 100 then raise exception 'Nombre y apellido: entre 1 y 100 caracteres'; end if;
 update public.perfiles set nombre=trim(p_nombre),apellido=trim(p_apellido) where id=auth.uid() and activo;
 if not found then raise exception 'Perfil no disponible'; end if;
end $$;

-- Reutiliza el comprobante ya existente y añade información legible de película/sala.
create function public.cine_detalle_reserva(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.cine_reservas; v jsonb;
begin
 select * into r from public.cine_reservas where token=p_token;
 if not found then raise exception 'Reserva inexistente'; end if;
 v := public.cine_comprobante(p_token);
 return v || jsonb_build_object('creada',r.creada,'pelicula',(
 select jsonb_build_object('id',p.id,'titulo',p.titulo,'clasificacion',p.clasificacion)
 from public.peliculas p join public.cine_funciones f on f.pelicula_id=p.id where f.id=r.funcion_id),
 'sala',(select s.nombre from public.cine_salas s join public.cine_funciones f on f.sala_id=s.id where f.id=r.funcion_id));
end $$;

create function public.cine_mis_reservas() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) then raise exception 'Acceso denegado'; end if;
 return coalesce((select jsonb_agg(public.cine_detalle_reserva(token) order by creada desc)
 from public.cine_reservas where usuario_id=auth.uid()),'[]'::jsonb);
end $$;

create function public.cine_mi_reserva(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cine_rol(array['cliente','empleado','administrador']) or not exists(
 select 1 from public.cine_reservas where token=p_token and usuario_id=auth.uid()) then raise exception 'Reserva no disponible para tu cuenta'; end if;
 return public.cine_detalle_reserva(p_token);
end $$;

revoke all on function public.cine_editar_mi_perfil(text,text),public.cine_detalle_reserva(uuid),
 public.cine_mis_reservas(),public.cine_mi_reserva(uuid) from public,anon,authenticated;
grant execute on function public.cine_editar_mi_perfil(text,text),public.cine_mis_reservas(),public.cine_mi_reserva(uuid) to authenticated;
-- El detalle por token mantiene el contrato de comprobante de portador para invitados.
grant execute on function public.cine_detalle_reserva(uuid) to anon,authenticated;
commit;
