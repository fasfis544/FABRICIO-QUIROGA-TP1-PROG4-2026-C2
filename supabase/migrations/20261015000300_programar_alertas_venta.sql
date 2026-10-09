-- Activación MANUAL del reloj: aplicar UNA VEZ tras 20261015000100.
-- Ejecutar con el rol de migraciones (postgres), nunca desde el navegador.
begin;
create extension if not exists pg_cron;
do $$
declare v record;
begin
  select * into v from cron.job where jobname='cine-alertas-venta';
  if found then
    if v.schedule<>'* * * * *' or v.command<>'select public.cine_procesar_alertas_venta();'
      or v.database<>current_database() or v.username<>current_user then
      raise exception 'Ya existe cine-alertas-venta con otra configuración: revisar sin sobrescribir';end if;
  else
    perform cron.schedule('cine-alertas-venta','* * * * *','select public.cine_procesar_alertas_venta();');
  end if;
end $$;
commit;
