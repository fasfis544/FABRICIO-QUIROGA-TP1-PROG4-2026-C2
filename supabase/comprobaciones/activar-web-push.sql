-- Activación MANUAL opcional, después de 20261017000100 y de configurar Edge/VAPID.
-- Antes: crear en Vault cine_push_dispatch_secret con el MISMO secreto de Edge.
-- No contiene secretos ni los incrusta en cron.job. No ejecutar bloques anteriores otra vez.
begin;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if not exists(select 1 from public.cine_push_config where id and habilitado) then
    raise exception 'Configurá primero Web Push';end if;
  if (select count(*) from vault.decrypted_secrets where name='cine_push_dispatch_secret')<>1
    or (select length(decrypted_secret) from vault.decrypted_secrets where name='cine_push_dispatch_secret')<32 then
    raise exception 'Falta un único secreto válido cine_push_dispatch_secret en Vault';end if;
end $$;
create function public.cine_push_invocar() returns bigint
language plpgsql security definer set search_path='' as $$
declare v_url text;v_secreto text;
begin
  select emisor_url into v_url from public.cine_push_config where id and habilitado;
  if v_url is null then return null;end if;
  select decrypted_secret into strict v_secreto from vault.decrypted_secrets where name='cine_push_dispatch_secret';
  if length(v_secreto)<32 then raise exception 'Secreto Push inválido';end if;
  return net.http_post(url:=v_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-cine-push-secret',v_secreto),
    body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function public.cine_push_invocar() from public,anon,authenticated,service_role;
do $$ declare v record;begin
  select * into v from cron.job where jobname='cine-web-push';
  if found then
    if v.schedule<>'* * * * *' or v.command<>'select public.cine_push_invocar();'
      or v.database<>current_database() or v.username<>current_user then
      raise exception 'Existe cine-web-push con otra configuración: revisar sin sobrescribir';end if;
  else perform cron.schedule('cine-web-push','* * * * *','select public.cine_push_invocar();');end if;
end $$;
commit;
