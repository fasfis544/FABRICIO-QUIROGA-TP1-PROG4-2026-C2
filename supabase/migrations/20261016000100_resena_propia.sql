-- Aplicar UNA VEZ después de los bloques ya instalados. No modifica reseñas/compras.
begin;
create or replace function public.cine_mi_reserva(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.cine_reservas;
begin
  if not public.cine_rol(array['cliente','empleado','administrador']) then
    raise exception 'Reserva no disponible para tu cuenta';
  end if;
  select * into r from public.cine_reservas where token=p_token and usuario_id=auth.uid();
  if not found then raise exception 'Reserva no disponible para tu cuenta';end if;
  return public.cine_detalle_reserva(p_token)||jsonb_build_object(
    'calificacion_propia',(select calificacion from public.cine_resenas where reserva_id=r.id and usuario_id=auth.uid()),
    'texto_propio',(select texto from public.cine_resenas where reserva_id=r.id and usuario_id=auth.uid()));
end $$;
revoke all on function public.cine_mi_reserva(uuid) from public,anon,authenticated;
grant execute on function public.cine_mi_reserva(uuid) to authenticated;
commit;
