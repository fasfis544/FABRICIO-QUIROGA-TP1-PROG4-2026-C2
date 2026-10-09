const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async ({ db, q, identity, admin, empleado }) => {
  await db.exec('reset role');
  const cliente = randomUUID();
  await q('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
    cliente,
    'operativo@example.com',
    {
      nombre: 'Operativo',
      apellido: 'Local',
      fecha_nacimiento: '1990-01-01',
      grupo_sanguineo: 'O+',
      color_ojos: 'Marrones',
      vacaciones_anuales: 14,
    },
  ]);
  const snapshot = async () =>
    (
      await q(`select jsonb_build_object(
    'reservas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_reservas t),
    'entradas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_entradas t),
    'movimientos',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_movimientos t),
    'salas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_salas t),
    'notificaciones',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_notificaciones t)) d`)
    ).d;
  const antes = await snapshot();
  await db.exec(
    fs.readFileSync(
      path.join(
        __dirname,
        '../supabase/migrations/20261015000100_mantenimiento_alertas_imagenes.sql',
      ),
      'utf8',
    ),
  );
  assert.deepEqual(
    await snapshot(),
    antes,
    'La instalación conserva historia, plano y notificaciones',
  );
  await identity(admin);
  const genero = (
    await q('select public.cine_guardar_genero($1) id', [
      { nombre: 'Operativo', slug: 'operativo', activa: true },
    ])
  ).id;
  const peliculaDatos = {
    titulo: 'Operativo',
    slug: 'operativo',
    sinopsis: 'Prueba',
    poster_url: '/icons/icon-512x512.png',
    clasificacion: 'ATP',
    duracion_minutos: 60,
    fecha_estreno: '2020-01-01',
    activa: true,
    idioma: 'castellano',
    formato: '2D',
  };
  const pelicula = (
    await q('select public.cine_guardar_pelicula($1,$2) id', [peliculaDatos, [genero]])
  ).id;
  const sala = (await q("select public.cine_guardar_sala('Sala operativo',20,28) id")).id;
  await db.exec('reset role');
  // Sala explícita solo en fixture local para evitar que asignación automática elija otra sala histórica.
  const funcion = (
    await q(
      "insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio,idioma,formato) values($1,$2,now()+interval '600 days',now()+interval '600 days 90 minutes',1000,'castellano','2D') returning id",
      [pelicula, sala],
    )
  ).id;
  await identity(admin);
  const plano = (await q('select public.cine_butacas_admin($1) d', [sala])).d;
  assert.equal(plano.butacas.length, 532);
  assert.equal(plano.butacas.filter((b) => b.tipo === 'accesible').length, 28);
  assert.equal(plano.butacas.filter((b) => b.tipo === 'vip').length, 84);
  assert.equal(plano.butacas.filter((b) => b.fila === 'J').length, 14);
  await q('select public.cine_mantener_butacas($1,$2,true,$3)', [
    sala,
    ['A1', 'J1', 'R1'],
    'Reparación local',
  ]);
  await identity(null, 'anon');
  const dispo = (await q('select public.cine_disponibilidad($1) d', [funcion])).d;
  assert.equal(dispo.butacas.length, 532);
  assert.deepEqual(dispo.bloqueadas, ['A1', 'J1', 'R1']);
  assert.equal(
    JSON.stringify(dispo).includes('Reparación local'),
    false,
    'No expone motivos administrativos al público',
  );
  await assert.rejects(
    () => q("select public.cine_cotizar($1,array['A1'],'[]','',0)", [funcion]),
    /mantenimiento/,
  );
  await identity(admin);
  for (const codigos of [['J15'], ['A1', 'A1'], [null]])
    await assert.rejects(
      () => q("select public.cine_mantener_butacas($1,$2,true,'Reparación')", [sala, codigos]),
      /válidas/,
    );
  await assert.rejects(
    () => q("select public.cine_mantener_butacas($1,array['A2'],true,'x')", [sala]),
    /motivo/,
  );
  await q("select public.cine_mantener_butacas($1,array['A1'],false,'Reparación finalizada')", [
    sala,
  ]);
  const cotizar = async (butaca) => {
    await identity(cliente);
    return (await q("select public.cine_cotizar($1,$2,'[]','',0) d", [funcion, [butaca]])).d;
  };
  const cotizacion = await cotizar('A1');
  const pedido = {
    funcion,
    butacas: ['A1'],
    candy: [],
    cupon: '',
    credito: 0,
    email: 'operativo@example.com',
    nombre: 'Operativo',
    edad: true,
    solicitud: randomUUID(),
    cotizacion,
  };
  await identity(null, 'service_role');
  const token = (
    await q('select public.cine_comprar_documento($1,$2,$3,$4) token', [
      cliente,
      pedido,
      randomUUID(),
      'x'.repeat(30),
    ])
  ).token;
  await identity(admin);
  await assert.rejects(
    () =>
      q("select public.cine_mantener_butacas($1,array['A1','A2'],true,'Reparación conjunta')", [
        sala,
      ]),
    /comprometidas/,
  );
  assert.equal(
    (await q('select public.cine_butacas_admin($1) d', [sala])).d.butacas.find(
      (b) => b.codigo === 'A2',
    ).bloqueada,
    false,
    'Lote rechazado sin aplicar cambios parciales',
  );
  assert.equal(
    (await q('select public.cine_butacas_admin($1) d', [sala])).d.butacas.find(
      (b) => b.codigo === 'A1',
    ).protegida,
    true,
  );
  const precioAntes = (await cotizar('A2')).a_pagar;
  const viejoPedido = {
    ...pedido,
    butacas: ['A2'],
    solicitud: randomUUID(),
    cotizacion: await cotizar('A2'),
  };
  await identity(admin);
  await q(
    "select public.cine_mantener_butacas($1,array['A2'],true,'Reparación posterior a cotizar')",
    [sala],
  );
  await identity(null, 'service_role');
  await assert.rejects(
    () =>
      q('select public.cine_comprar_documento($1,$2,$3,$4)', [
        cliente,
        viejoPedido,
        randomUUID(),
        'x'.repeat(30),
      ]),
    /mantenimiento/,
  );
  await identity(admin);
  await q("select public.cine_mantener_butacas($1,array['A2'],false,'Lista para venta')", [sala]);
  assert.equal((await cotizar('A2')).a_pagar, precioAntes, 'Restaurar no cambia tarifas');
  await db.exec('reset role');
  const historial = await q(
    'select documento_pdf,estado from public.cine_reservas where token=$1',
    [token],
  );
  assert.equal(historial.documento_pdf, 'x'.repeat(30));
  assert.equal(historial.estado, 'confirmada');
  assert.ok(
    (
      await q(
        "select count(*)::int n from public.cine_auditoria where tabla='cine_butacas_mantenimiento'",
      )
    ).n >= 4,
  );
  assert.ok(
    (await q('select revision from public.cine_eventos_publicos where id=$1', [funcion])).revision >
      1,
  );

  // Reserva histórica vigente también protege; vencida/cancelada no lo hace.
  const reserva = (
    await q(
      "insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,total,vence,estado) values($1,$2,$3,'reserva@example.com',1000,now()+interval '15 minutes','pendiente') returning id",
      [randomUUID(), funcion, cliente],
    )
  ).id;
  await q("insert into public.cine_entradas(reserva_id,funcion_id,butaca) values($1,$2,'B1')", [
    reserva,
    funcion,
  ]);
  await identity(admin);
  await assert.rejects(
    () => q("select public.cine_mantener_butacas($1,array['B1'],true,'Reparación')", [sala]),
    /comprometidas/,
  );
  await db.exec('reset role');
  await q("update public.cine_reservas set vence=now()-interval '1 minute' where id=$1", [reserva]);
  await identity(admin);
  await q("select public.cine_mantener_butacas($1,array['B1'],true,'Reserva ya vencida')", [sala]);

  // Apertura por reloj, límites inclusivos de Argentina, sala activa y fecha real de preventa.
  const estreno = (
    await q("select ((now() at time zone 'America/Argentina/Buenos_Aires')::date+8)::text d")
  ).d;
  const futuraDatos = {
    ...peliculaDatos,
    titulo: 'Futura operativo',
    slug: 'futura-operativo',
    fecha_estreno: estreno,
    precio_preventa: 700,
  };
  const futura = (await q('select public.cine_guardar_pelicula($1,$2) id', [futuraDatos, [genero]]))
    .id;
  await identity(cliente);
  await q('select public.cine_alerta($1,true)', [futura]);
  await db.exec('reset role');
  await q(
    "insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio,idioma,formato) values($1,$2,now()+interval '601 days',now()+interval '601 days 90 minutes',1000,'castellano','2D')",
    [futura, sala],
  );
  assert.equal(
    (
      await q('select count(*)::int n from public.cine_notificaciones where clave=$1', [
        'venta:' + futura,
      ])
    ).n,
    0,
    'Crear función antes de ventana no avisa',
  );
  const apertura = (
    await q(
      "select (($1::date-7)::timestamp at time zone 'America/Argentina/Buenos_Aires')::text t",
      [estreno],
    )
  ).t;
  assert.equal(
    (
      await q(
        "select public.cine_venta_habilitada($1,$2::timestamptz-interval '1 microsecond') b",
        [futura, apertura],
      )
    ).b,
    false,
  );
  assert.equal(
    (await q('select public.cine_venta_habilitada($1,$2) b', [futura, apertura])).b,
    true,
  );
  const sinFuncion = (
    await q(
      'insert into public.peliculas(titulo,slug,sinopsis,poster_url,duracion_minutos,clasificacion,fecha_estreno,activa) values($1,$2,$3,$4,60,$5,$6,true) returning id',
      ['Sin función', 'sin-funcion', 'Prueba', '/icons/icon-512x512.png', 'ATP', '2020-01-01'],
    )
  ).id;
  assert.equal(
    (await q('select public.cine_venta_habilitada($1,$2) b', [sinFuncion, apertura])).b,
    false,
    'Estreno sin función no habilita venta',
  );
  await q('update public.cine_funciones set activa=false where pelicula_id=$1', [futura]);
  assert.equal(
    (await q('select public.cine_venta_habilitada($1,$2) b', [futura, apertura])).b,
    false,
    'Función inactiva no avisa',
  );
  await q('update public.cine_funciones set activa=true where pelicula_id=$1', [futura]);
  await identity(null, 'service_role');
  assert.equal((await q('select public.cine_procesar_alertas_venta($1) n', [apertura])).n, 1);
  assert.equal(
    (await q('select public.cine_procesar_alertas_venta($1) n', [apertura])).n,
    0,
    'Reintento no duplica aviso',
  );
  await db.exec('reset role');
  await q('update public.cine_salas set activa=false where id=$1', [sala]);
  assert.equal(
    (await q('select public.cine_venta_habilitada($1,$2) b', [futura, apertura])).b,
    false,
  );
  await q('update public.cine_salas set activa=true where id=$1', [sala]);
  await q('update public.peliculas set precio_preventa=null where id=$1', [futura]);
  assert.equal(
    (await q('select public.cine_venta_habilitada($1,$2) b', [futura, apertura])).b,
    false,
    'Sin precio de preventa no vende antes del estreno',
  );
  assert.equal(
    (
      await q(
        "select public.cine_venta_habilitada($1,($2::date::timestamp at time zone 'America/Argentina/Buenos_Aires')) b",
        [futura, estreno],
      )
    ).b,
    true,
    'En estreno habilita precio regular',
  );
  await identity(cliente);
  const beneficios = (await q('select public.cine_mis_beneficios() d')).d;
  assert.ok(Array.isArray(beneficios.cupones));
  assert.ok(Array.isArray(beneficios.movimientos));
  assert.equal(beneficios.notificaciones.filter((n) => n.clave === 'venta:' + futura).length, 1);
  assert.equal(
    beneficios.notificaciones.some((n) => n.mensaje.startsWith('Ya está estrenada:')),
    false,
  );

  // Emulación estructural de Storage/RLS, NO subida real a Supabase.
  await db.exec(`reset role;create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  await db.exec(
    fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20261015000200_productos_storage.sql'),
      'utf8',
    ),
  );
  await identity(admin);
  const ruta = admin + '/' + randomUUID() + '.png';
  await q("insert into storage.objects(bucket_id,name) values('productos-cine',$1)", [ruta]);
  const productoDatos = {
    nombre: 'Producto imagen',
    precio: 100,
    stock: 20,
    activo: true,
    categoria: 'Comida',
    imagen_path: ruta,
  };
  const producto = (await q("select public.cine_guardar_oferta('producto',$1) id", [productoDatos]))
    .id;
  assert.equal(
    (await q('select public.cine_ofertas_admin() d')).d.productos.find((p) => p.id === producto)
      .imagen_path,
    ruta,
  );
  await identity(null, 'anon');
  assert.equal(
    (await q('select public.cine_candy_catalogo() d')).d.productos.find((p) => p.id === producto)
      .imagen_path,
    ruta,
  );
  await identity(admin);
  await q("select public.cine_guardar_oferta('producto',$1)", [
    { ...productoDatos, id: producto, imagen_path: '' },
  ]);
  assert.equal(
    (await q('select public.cine_ofertas_admin() d')).d.productos.find((p) => p.id === producto)
      .imagen_path,
    null,
  );
  await assert.rejects(
    () =>
      q("select public.cine_guardar_oferta('producto',$1)", [
        { ...productoDatos, imagen_path: admin + '/' + randomUUID() + '.png' },
      ]),
    /inválida/,
  );
  await assert.rejects(
    () =>
      q("select public.cine_guardar_oferta('producto',$1)", [
        { ...productoDatos, imagen_path: 'https://evil.test/image.svg' },
      ]),
    /inválida/,
  );
  for (const id of [cliente, empleado, null]) {
    await identity(id, id ? 'authenticated' : 'anon');
    await assert.rejects(
      () => q('select public.cine_butacas_admin($1)', [sala]),
      /denegado|permission denied/,
    );
    await assert.rejects(
      () => q("select public.cine_mantener_butacas($1,array['C1'],true,'No autorizado')", [sala]),
      /denegado|permission denied/,
    );
    await assert.rejects(
      () => q('select public.cine_procesar_alertas_venta()'),
      /permission denied/,
    );
    await assert.rejects(
      () => q('select * from public.cine_butacas_mantenimiento'),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        q("insert into storage.objects(bucket_id,name) values('productos-cine',$1)", [
          (id ?? admin) + '/' + randomUUID() + '.png',
        ]),
      /row-level security/,
    );
  }
  await identity(admin);
  await assert.rejects(
    () =>
      q("insert into storage.objects(bucket_id,name) values('productos-cine',$1)", [
        cliente + '/' + randomUUID() + '.png',
      ]),
    /row-level security/,
  );
  await assert.rejects(
    () =>
      q("insert into storage.objects(bucket_id,name) values('productos-cine',$1)", [
        admin + '/' + randomUUID() + '.svg',
      ]),
    /row-level security/,
  );
  await q("delete from storage.objects where bucket_id='productos-cine'");
  await db.exec('reset role');
  assert.equal(
    (await q('select count(*)::int n from storage.objects where name=$1', [ruta])).n,
    1,
    'Quitar imagen y DELETE cliente no borran archivo histórico',
  );
  await q('update public.perfiles set activo=false where id=$1', [admin]);
  await identity(admin);
  await assert.rejects(() => q('select public.cine_butacas_admin($1)', [sala]), /denegado/);
  await assert.rejects(
    () =>
      q("insert into storage.objects(bucket_id,name) values('productos-cine',$1)", [
        admin + '/' + randomUUID() + '.png',
      ]),
    /row-level security/,
  );
  await db.exec('reset role');
  await q('update public.perfiles set activo=true where id=$1', [admin]);
  // pg_cron no está disponible en PGlite: verificar contrato de configuración con un mock SQL explícito.
  await db.exec(`create schema cron;create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,database text,username text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare v bigint;begin
      insert into cron.job(jobname,schedule,command,database,username) values($1,$2,$3,current_database(),current_user) returning jobid into v;return v;end$$;`);
  const schedulerSql = fs
    .readFileSync(
      path.join(__dirname, '../supabase/migrations/20261015000300_programar_alertas_venta.sql'),
      'utf8',
    )
    .replace('create extension if not exists pg_cron;', '');
  await db.exec(schedulerSql);
  await db.exec(schedulerSql);
  assert.equal(
    (await q("select count(*)::int n from cron.job where jobname='cine-alertas-venta'")).n,
    1,
  );
  await q("update cron.job set schedule='0 0 * * *' where jobname='cine-alertas-venta'");
  await assert.rejects(() => db.exec(schedulerSql), /otra configuración/);
  await db.exec('rollback');
  console.log(
    'Operativo: plano 532/28/84, bloqueo/restauración atómica, compra posterior a bloqueo rechazada, reservas protegidas, historia intacta, Realtime/auditoría, apertura Argentina e idempotencia, imágenes/catálogo y permisos RLS/Storage estructural: OK',
  );
};
