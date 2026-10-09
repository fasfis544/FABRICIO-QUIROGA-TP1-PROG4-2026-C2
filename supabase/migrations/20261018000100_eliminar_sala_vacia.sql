-- Eliminacion definitiva de salas que nunca tuvieron actividad.
begin;

create or replace function public.cine_eliminar_sala_definitivamente(p_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_nombre text;
begin
  if not public.cine_rol(array['administrador']) then
    raise exception 'Acceso denegado';
  end if;
  if p_id is null then
    raise exception 'Sala inválida';
  end if;

  perform 1 from public.cine_mutex for update;
  select nombre into v_nombre
  from public.cine_salas
  where id=p_id
  for update;
  if not found then
    raise exception 'La sala no existe';
  end if;

  if exists(select 1 from public.cine_funciones where sala_id=p_id)
    or exists(select 1 from public.cine_butacas_mantenimiento where sala_id=p_id)
  then
    raise exception 'No se puede eliminar la sala: tiene funciones o historial asociado. Desactivala para conservar los registros';
  end if;

  delete from public.cine_salas where id=p_id;
  insert into public.cine_auditoria(tabla,operacion,usuario_id,registro)
  values(
    'cine_salas',
    'ELIMINAR_DEFINITIVAMENTE',
    auth.uid(),
    jsonb_build_object('id',p_id,'nombre',v_nombre)
  );
end
$$;

revoke all on function public.cine_eliminar_sala_definitivamente(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.cine_eliminar_sala_definitivamente(uuid)
to authenticated;
commit;
