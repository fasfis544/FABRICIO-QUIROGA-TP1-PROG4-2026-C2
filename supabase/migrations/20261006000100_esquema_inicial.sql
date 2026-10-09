
begin;

create type public.rol_usuario as enum ('cliente', 'empleado', 'administrador');
create type public.clasificacion_pelicula as enum ('ATP', '13', '16', '18');

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text check (length(nombre) <= 100),
  apellido text check (length(apellido) <= 100),
  rol public.rol_usuario not null default 'cliente',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.peliculas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) between 1 and 150),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sinopsis text not null default '',
  duracion_minutos integer not null check (duracion_minutos between 1 and 600),
  clasificacion public.clasificacion_pelicula not null,
  fecha_estreno date not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.peliculas_generos (
  pelicula_id uuid not null references public.peliculas(id),
  genero_id uuid not null references public.generos(id),
  primary key (pelicula_id, genero_id)
);
create index peliculas_generos_genero_idx on public.peliculas_generos(genero_id);

create table public.eventos_auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id uuid not null,
  usuario_id uuid references auth.users(id) on delete set null,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  created_at timestamptz not null default now()
);
create index eventos_auditoria_fecha_idx on public.eventos_auditoria(created_at desc);

create function public.actualizar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger perfiles_updated_at before update on public.perfiles
  for each row execute function public.actualizar_updated_at();
create trigger generos_updated_at before update on public.generos
  for each row execute function public.actualizar_updated_at();
create trigger peliculas_updated_at before update on public.peliculas
  for each row execute function public.actualizar_updated_at();

create function public.crear_perfil_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles(id, nombre, apellido, rol, activo)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'nombre'), 100), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'apellido'), 100), ''),
    'cliente', true
  );
  return new;
end;
$$;
create trigger crear_perfil_al_registrar_usuario after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- Usuarios Auth existentes al instalar en un proyecto nuevo: siempre clientes.
insert into public.perfiles(id, nombre, apellido)
select id, nullif(left(trim(raw_user_meta_data ->> 'nombre'), 100), ''),
  nullif(left(trim(raw_user_meta_data ->> 'apellido'), 100), '')
from auth.users on conflict (id) do nothing;

create function public.es_administrador_activo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfiles
    where id = auth.uid() and activo and rol = 'administrador');
$$;

create function public.administrar_perfil(
  p_usuario_id uuid, p_rol public.rol_usuario, p_activo boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador_activo() then raise exception 'Acceso denegado'; end if;
  if p_rol is null or p_activo is null then raise exception 'Rol y estado son obligatorios'; end if;
  if p_usuario_id = auth.uid() and (p_rol <> 'administrador' or not p_activo) then
    raise exception 'No podés quitarte tu propio acceso administrativo';
  end if;
  update public.perfiles set rol = p_rol, activo = p_activo where id = p_usuario_id;
  if not found then raise exception 'Perfil inexistente'; end if;
end;
$$;

create function public.auditar_catalogo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.eventos_auditoria(tabla, operacion, registro_id, usuario_id, datos_anteriores, datos_nuevos)
  values (tg_table_name, tg_op, case when tg_op = 'DELETE' then old.id else new.id end, auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end);
  return null;
end;
$$;
create trigger peliculas_auditoria after insert or update or delete on public.peliculas
  for each row execute function public.auditar_catalogo();
create trigger generos_auditoria after insert or update or delete on public.generos
  for each row execute function public.auditar_catalogo();

alter table public.perfiles enable row level security;
alter table public.generos enable row level security;
alter table public.peliculas enable row level security;
alter table public.peliculas_generos enable row level security;
alter table public.eventos_auditoria enable row level security;

revoke all on public.perfiles, public.generos, public.peliculas,
  public.peliculas_generos, public.eventos_auditoria from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.perfiles to authenticated;
grant update(nombre, apellido) on public.perfiles to authenticated;
grant select on public.generos, public.peliculas, public.peliculas_generos to anon, authenticated;
grant insert, update on public.generos, public.peliculas to authenticated;
grant insert, update, delete on public.peliculas_generos to authenticated;
grant select on public.eventos_auditoria to authenticated;

create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_administrador_activo());
create policy perfiles_editar_datos on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy generos_lectura_publica on public.generos for select
  using (activa or public.es_administrador_activo());
create policy generos_insertar_admin on public.generos for insert to authenticated
  with check (public.es_administrador_activo());
create policy generos_editar_admin on public.generos for update to authenticated
  using (public.es_administrador_activo()) with check (public.es_administrador_activo());

create policy peliculas_lectura_publica on public.peliculas for select
  using (activa or public.es_administrador_activo());
create policy peliculas_insertar_admin on public.peliculas for insert to authenticated
  with check (public.es_administrador_activo());
create policy peliculas_editar_admin on public.peliculas for update to authenticated
  using (public.es_administrador_activo()) with check (public.es_administrador_activo());

create policy peliculas_generos_lectura_publica on public.peliculas_generos for select using (
  public.es_administrador_activo() or (
    exists(select 1 from public.peliculas p where p.id = pelicula_id and p.activa)
    and exists(select 1 from public.generos g where g.id = genero_id and g.activa)
  )
);
create policy peliculas_generos_insertar_admin on public.peliculas_generos for insert to authenticated
  with check (public.es_administrador_activo());
create policy peliculas_generos_editar_admin on public.peliculas_generos for update to authenticated
  using (public.es_administrador_activo()) with check (public.es_administrador_activo());
create policy peliculas_generos_quitar_admin on public.peliculas_generos for delete to authenticated
  using (public.es_administrador_activo());
create policy auditoria_lectura_admin on public.eventos_auditoria for select to authenticated
  using (public.es_administrador_activo());

revoke all on function public.actualizar_updated_at(), public.crear_perfil_usuario(),
  public.auditar_catalogo(), public.es_administrador_activo(),
  public.administrar_perfil(uuid, public.rol_usuario, boolean) from public, anon, authenticated;
grant execute on function public.es_administrador_activo() to anon, authenticated;
grant execute on function public.administrar_perfil(uuid, public.rol_usuario, boolean) to authenticated;

commit;
