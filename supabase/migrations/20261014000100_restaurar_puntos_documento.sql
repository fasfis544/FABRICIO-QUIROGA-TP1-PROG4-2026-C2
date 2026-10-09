-- Nueva migración, DESPUÉS de puntos_por_ocho ya aplicado.
-- RF-50 / RN-12: vuelve a 1 punto por peso para compras NUEVAS.
-- Conserva reservas, movimientos, canjes, recompensas y puntos históricos.
begin;
do $$
declare definicion text;
  anterior text := 'floor((v->>''a_pagar'')::numeric / 8)::integer';
  nueva text := 'floor((v->>''a_pagar'')::numeric)::integer';
begin
  select pg_get_functiondef('public.cine_comprar_documento(uuid,jsonb,uuid,text)'::regprocedure) into definicion;
  -- Modificación mínima de la RPC instalada: mantiene locks, controles y commit.
  -- Fallar cerrado si una versión distinta no contiene la fórmula conocida.
  if strpos(definicion,anterior)>0 then
    if (length(definicion)-length(replace(definicion,anterior,'')))/length(anterior)<>1 then
      raise exception 'La RPC contiene más de una fórmula: revisar antes de actualizar';
    end if;
    execute replace(definicion,anterior,nueva);
  elsif strpos(definicion,nueva)=0 then
    raise exception 'Fórmula de puntos desconocida: no se modificó la RPC';
  end if;
end $$;
revoke all on function public.cine_comprar_documento(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.cine_comprar_documento(uuid,jsonb,uuid,text) to service_role;
commit;
