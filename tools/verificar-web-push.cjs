const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createECDH, randomBytes } = require('node:crypto');

module.exports = async ({ db, q, identity, admin, cliente, empleado }) => {
  let casos = 0;
  const test = async (nombre, fn) => {
    try {
      await fn();
      casos++;
    } catch (e) {
      throw new Error('Push SQL: ' + nombre, { cause: e });
    }
  };
  const owner = () => db.exec('reset role');
  const actor = async (id, rol = 'authenticated') => {
    await owner();
    await q("select set_config('request.jwt.claim.sub','',false)");
    await identity(id, rol);
  };
  await owner();
  await q('update public.perfiles set activo=true where id=any($1::uuid[])', [
    [admin, cliente, empleado],
  ]);
  const historia = async () => {
    await owner();
    return (
      await q(`select jsonb_build_object(
    'compras',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_reservas t),
    'entradas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_entradas t),
    'movimientos',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_movimientos t),
    'canjes',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_canjes t),
    'resenas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_resenas t),
    'notificaciones',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_notificaciones t)) d`)
    ).d;
  };
  const original = await historia();
  await db.exec(
    fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20261017000100_web_push.sql'),
      'utf8',
    ),
  );
  await test('instalación aditiva e historia íntegra', async () =>
    assert.deepEqual(await historia(), original));
  const ec = createECDH('prime256v1');
  ec.generateKeys();
  const clave = ec.getPublicKey().toString('base64url'),
    auth = randomBytes(16).toString('base64url');
  const endpoint = (n) => 'https://fcm.googleapis.com/fcm/send/prueba-local-' + n;
  const rpc = async (nombre, args = []) =>
    (
      await q(
        'select public.' + nombre + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') d',
        args,
      )
    ).d;
  const suscribir = (usuario = cliente, n = 'principal') =>
    rpc('cine_push_suscribir', [usuario, endpoint(n), clave, auth, clave]);
  const lote = async () => {
    await actor(null, 'service_role');
    return await rpc('cine_push_tomar_lote', [clave, 20]);
  };
  const eventos = async () => {
    await owner();
    return (await db.query('select * from public.cine_push_eventos order by creada,id')).rows;
  };
  const envios = async () => {
    await owner();
    return (await db.query('select * from public.cine_push_envios order by id')).rows;
  };
  const finalizar = async (j, resultado, http = null, espera = 0) => {
    await actor(null, 'service_role');
    return await rpc('cine_push_finalizar', [j.id, j.lease, resultado, http, espera]);
  };
  await test('config inicialmente deshabilitada', async () => {
    await actor(cliente);
    assert.deepEqual(await rpc('cine_push_configuracion'), {
      habilitado: false,
      clave_publica: '',
      origen: '',
    });
    await assert.rejects(() => suscribir(), /no configurado/);
  });
  await test('anon no ejecuta RPC privadas', async () => {
    await actor(null, 'anon');
    for (const name of ['cine_push_configuracion', 'cine_push_estado'])
      await assert.rejects(
        () => rpc(name, name.endsWith('estado') ? [endpoint('principal')] : []),
        /permission denied/,
      );
  });
  await actor(null, 'service_role');
  await rpc('cine_push_configurar', [
    'https://cine.example',
    clave,
    'https://prueba.supabase.co/functions/v1/enviar-push',
  ]);
  await test('solo backend configura y emite', async () => {
    await actor(admin);
    await assert.rejects(
      () =>
        rpc('cine_push_configurar', [
          'https://cine.example',
          clave,
          'https://prueba.supabase.co/functions/v1/enviar-push',
        ]),
      /permission denied/,
    );
    await assert.rejects(() => rpc('cine_push_tomar_lote', [clave, 20]), /permission denied/);
    await assert.rejects(() => rpc('cine_push_recordatorios'), /permission denied/);
  });
  await test('grants tabla y TRUNCATE privados incluso service_role', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await actor(role === 'authenticated' ? cliente : null, role);
      for (const tabla of [
        'cine_push_config',
        'cine_push_suscripciones',
        'cine_push_eventos',
        'cine_push_envios',
      ]) {
        await assert.rejects(() => q('select * from public.' + tabla), /permission denied/);
        await assert.rejects(() => q('truncate public.' + tabla + ' cascade'), /permission denied/);
      }
    }
  });
  await test('perfil inactivo no suscribe', async () => {
    await owner();
    await q('update public.perfiles set activo=false where id=$1', [cliente]);
    await actor(cliente);
    await assert.rejects(() => suscribir(), /Acceso denegado/);
    await owner();
    await q('update public.perfiles set activo=true where id=$1', [cliente]);
  });
  await test('titular esperado evita cambio de cuenta en vuelo', async () => {
    await actor(cliente);
    await assert.rejects(() => suscribir(admin), /Acceso denegado/);
  });
  for (const malo of [
    'http://fcm.googleapis.com/fcm/send/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.test/fcm/send/x',
    'https://user@fcm.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com:444/fcm/send/x',
    'https://fcm.googleapis.com/fcm/send/x#secret',
    'https://evil.test/x',
  ])
    await test('SSRF bloqueado', async () => {
      await actor(cliente);
      await assert.rejects(
        () => rpc('cine_push_suscribir', [cliente, malo, clave, auth, clave]),
        /inválida/,
      );
    });
  await test('claves malformadas se rechazan', async () => {
    await actor(cliente);
    await assert.rejects(
      () => rpc('cine_push_suscribir', [cliente, endpoint('principal'), 'mal', auth, clave]),
      /inválida/,
    );
    await assert.rejects(
      () => rpc('cine_push_suscribir', [cliente, endpoint('principal'), clave, 'mal', clave]),
      /inválida/,
    );
  });
  await test('alta idempotente y propiedad privada', async () => {
    await actor(cliente);
    await suscribir();
    await suscribir();
    assert.equal(await rpc('cine_push_estado', [endpoint('principal')]), true);
    await actor(admin);
    assert.equal(await rpc('cine_push_estado', [endpoint('principal')]), false);
    await owner();
    assert.equal((await q('select count(*)::int n from public.cine_push_suscripciones')).n, 1);
  });
  const noAvisos = await eventos();
  assert.equal(noAvisos.length, 0);
  const peli = (
    await q(`insert into public.peliculas(titulo,slug,sinopsis,duracion_minutos,clasificacion,fecha_estreno,poster_url,activa,idioma,formato)
    values('Push local','push-local','Prueba',60,'ATP','2020-01-01','/afiche.png',true,'castellano','2D') returning id`)
  ).id;
  const sala = (
    await q(
      `insert into public.cine_salas(nombre,filas,columnas,distribucion_documento) values('Push local',20,28,true) returning id`,
    )
  ).id;
  const compra = async (
    minutos = 1435,
    usuario = cliente,
    estado = 'confirmada',
    creacionAntigua = true,
  ) => {
    await owner();
    const f = await q(
      `insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio,idioma,formato)
      values($1,$2,clock_timestamp()+$3*interval '1 minute',clock_timestamp()+($3+90)*interval '1 minute',1000,'castellano','2D') returning id,inicio`,
      [peli, sala, minutos],
    );
    const r = await q(
      `insert into public.cine_reservas(funcion_id,usuario_id,solicitud,email,total,estado,creada,candy)
      values($1,$2,$3,'prueba@example.test',1000,$4,clock_timestamp()-case when $5 then interval '2 days' else interval '0' end,'[{"nombre":"Prueba","cantidad":1}]') returning id,token`,
      [f.id, usuario, randomUUID(), estado, creacionAntigua],
    );
    await q(
      `insert into public.cine_entradas(reserva_id,funcion_id,butaca,precio) values($1,$2,'A1',1000),($1,$2,'A2',1000)`,
      [r.id, f.id],
    );
    return { ...r, funcion: f.id, inicio: f.inicio };
  };
  const r24 = await compra(),
    r2 = await compra(115);
  const cancelada = await compra(115, cliente, 'cancelada'),
    guest = await compra(115, null),
    reciente = await compra(115, cliente, 'confirmada', false);
  await test('recordatorios 24/2, una vez por compra, sin invitados/canceladas/tardías', async () => {
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    await rpc('cine_push_recordatorios');
    const e = await eventos();
    assert.equal(e.length, 2);
    assert.deepEqual(new Set(e.map((x) => x.reserva_id)), new Set([r24.id, r2.id]));
    assert(e.some((x) => x.tipo === 'recordatorio_24'));
    assert(e.some((x) => x.tipo === 'recordatorio_2'));
  });
  await test('claim acotado sin doble entrega mientras lease activa', async () => {
    const jobs = await lote();
    assert.equal(jobs.length, 2);
    assert.deepEqual(await lote(), []);
    for (const j of jobs) {
      assert.deepEqual(Object.keys(j).sort(), [
        'id',
        'lease',
        'origen',
        'pelicula_id',
        'suscripcion',
        'tipo',
        'vence',
      ]);
      await finalizar(j, 'enviado', 201);
    }
  });
  await test('lote requiere clave y límite válidos', async () => {
    await actor(null, 'service_role');
    await assert.rejects(() => rpc('cine_push_tomar_lote', ['mal', 20]), /VAPID/);
    await assert.rejects(() => rpc('cine_push_tomar_lote', [clave, 21]), /Lote/);
  });
  await test('validación conjunta genera un solo ingreso y candy independiente', async () => {
    await owner();
    await q('update public.cine_entradas set usada_en=clock_timestamp() where reserva_id=$1', [
      r2.id,
    ]);
    await q('update public.cine_reservas set candy_usada_en=clock_timestamp() where id=$1', [
      r2.id,
    ]);
    await q('update public.cine_entradas set usada_en=clock_timestamp() where reserva_id=$1', [
      r2.id,
    ]);
    const e = await eventos();
    assert.equal(e.filter((x) => x.tipo === 'ingreso' && x.reserva_id === r2.id).length, 1);
    assert.equal(e.filter((x) => x.tipo === 'candy' && x.reserva_id === r2.id).length, 1);
  });
  await test('cancelación después de encolar descarta recordatorio', async () => {
    const r = await compra();
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    await owner();
    await q("update public.cine_reservas set estado='cancelada' where id=$1", [r.id]);
    const jobs = await lote();
    assert.equal(jobs.length, 2);
    for (const j of jobs) await finalizar(j, 'enviado', 201);
    const e = await eventos(),
      ev = e.find((x) => x.reserva_id === r.id);
    const rows = await envios();
    assert.equal(rows.find((x) => x.evento_id === ev.id).estado, 'descartado');
  });
  await test('lease falsa no confirma y lease vencida se recupera', async () => {
    const r = await compra();
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    const [j] = await lote();
    assert(j);
    assert.equal(await finalizar({ ...j, lease: randomUUID() }, 'enviado', 201), false);
    await owner();
    await q(
      "update public.cine_push_envios set lease_hasta=clock_timestamp()-interval '1 second' where id=$1",
      [j.id],
    );
    const [retry] = await lote();
    assert.equal(retry.id, j.id);
    assert.notEqual(retry.lease, j.lease);
    assert.equal(await finalizar(j, 'enviado', 201), false);
    assert.equal(await finalizar(retry, 'enviado', 201), true);
    assert.equal(await finalizar(retry, 'enviado', 201), false);
  });
  await test('reintento/backoff, Retry-After y máximo seis intentos', async () => {
    await compra();
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    let [j] = await lote();
    assert(j);
    await finalizar(j, 'reintento', 429, 120);
    let fila = (await envios()).find((x) => x.id === j.id);
    assert.equal(fila.estado, 'pendiente');
    assert.equal(fila.intentos, 1);
    assert(Date.parse(fila.proximo) - Date.now() > 110000);
    assert.deepEqual(await lote(), []);
    for (let i = 2; i <= 6; i++) {
      await owner();
      await q(
        "update public.cine_push_envios set proximo=clock_timestamp()-interval '1 second' where id=$1",
        [j.id],
      );
      [j] = await lote();
      assert(j);
      await finalizar(j, 'reintento', 503);
    }
    fila = (await envios()).find((x) => x.id === j.id);
    assert.equal(fila.estado, 'fallido');
    assert.equal(fila.intentos, 6);
  });
  await test('venta efectiva deduplicada y sin replay de historial', async () => {
    await owner();
    await q('insert into public.cine_alertas(usuario_id,pelicula_id) values($1,$2)', [
      cliente,
      peli,
    ]);
    let e = await eventos();
    assert.equal(e.filter((x) => x.tipo === 'venta').length, 1);
    await actor(null, 'service_role');
    await rpc('cine_procesar_alertas_venta');
    e = await eventos();
    assert.equal(e.filter((x) => x.tipo === 'venta').length, 1);
    const jobs = await lote();
    assert.equal(jobs.filter((x) => x.tipo === 'venta').length, 1);
    for (const j of jobs) await finalizar(j, 'enviado', 201);
  });
  await test('baja de alerta invalida venta en cola', async () => {
    await owner();
    await q('delete from public.cine_notificaciones where usuario_id=$1 and clave=$2', [
      cliente,
      'venta:' + peli,
    ]);
    await q(
      "delete from public.cine_push_envios where evento_id in(select id from public.cine_push_eventos where tipo='venta')",
    );
    await q("delete from public.cine_push_eventos where tipo='venta'");
    await q(
      "insert into public.cine_notificaciones(usuario_id,mensaje,clave) values($1,'Venta',$2)",
      [cliente, 'venta:' + peli],
    );
    await actor(cliente);
    await rpc('cine_alerta', [peli, false]);
    assert.deepEqual(await lote(), []);
    assert((await envios()).some((x) => x.estado === 'descartado'));
  });
  await test('perfil inactivo descarta envío ya encolado', async () => {
    await compra();
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    await owner();
    await q('update public.perfiles set activo=false where id=$1', [cliente]);
    assert.deepEqual(await lote(), []);
    await owner();
    await q('update public.perfiles set activo=true where id=$1', [cliente]);
  });
  await test('404/410 desactiva dispositivo y descarta todas sus pendientes', async () => {
    await compra();
    await compra(115);
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    const jobs = await lote();
    assert(jobs.length >= 2);
    assert.equal(await finalizar(jobs[0], 'expirada', 410), true);
    assert.equal(await finalizar(jobs[1], 'enviado', 201), false);
    await actor(cliente);
    assert.equal(await rpc('cine_push_estado', [endpoint('principal')]), false);
  });
  await test('reactivación no revive entregas viejas', async () => {
    await actor(cliente);
    await suscribir();
    assert.deepEqual(await lote(), []);
  });
  await test('baja consentida descarta lease y respeta titular', async () => {
    await compra();
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    const [j] = await lote();
    assert(j);
    await actor(admin);
    await rpc('cine_push_desuscribir', [admin, endpoint('principal')]);
    await actor(null, 'service_role');
    assert.equal(await rpc('cine_push_autorizar_envio', [j.id, j.lease]), true);
    await actor(cliente);
    await rpc('cine_push_desuscribir', [cliente, endpoint('principal')]);
    await actor(null, 'service_role');
    assert.equal(await rpc('cine_push_autorizar_envio', [j.id, j.lease]), false);
    assert.equal(await finalizar(j, 'enviado', 201), false);
  });
  await test('cambio de cuenta invalida envíos previos del dispositivo', async () => {
    await actor(cliente);
    await suscribir();
    await compra();
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    const [j] = await lote();
    assert(j);
    await actor(admin);
    await suscribir(admin);
    await actor(cliente);
    assert.equal(await rpc('cine_push_estado', [endpoint('principal')]), false);
    await actor(null, 'service_role');
    assert.equal(await rpc('cine_push_autorizar_envio', [j.id, j.lease]), false);
    await actor(admin);
    assert.equal(await rpc('cine_push_estado', [endpoint('principal')]), true);
  });
  await test('rotación VAPID activa requiere plan explícito', async () => {
    const otra = createECDH('prime256v1');
    otra.generateKeys();
    await actor(null, 'service_role');
    await assert.rejects(
      () =>
        rpc('cine_push_configurar', [
          'https://cine.example',
          otra.getPublicKey().toString('base64url'),
          'https://prueba.supabase.co/functions/v1/enviar-push',
        ]),
      /rotación/,
    );
  });
  await test('máximo diez dispositivos activos y alta repetida permitida', async () => {
    await actor(empleado);
    for (let i = 0; i < 10; i++) await suscribir(empleado, 'limite-' + i);
    await suscribir(empleado, 'limite-0');
    await assert.rejects(() => suscribir(empleado, 'limite-10'), /diez/);
  });
  await test('sin consentimiento no crea outbox para invitado/cuenta nueva', async () => {
    await owner();
    const antes = (await eventos()).length;
    await q('update public.cine_entradas set usada_en=clock_timestamp() where reserva_id=$1', [
      guest.id,
    ]);
    assert.equal((await eventos()).length, antes);
  });
  await test('fuera del margen de quince minutos no encola recordatorios', async () => {
    await actor(cliente);
    await suscribir();
    const r = await compra(1410);
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    assert.equal((await eventos()).filter((e) => e.reserva_id === r.id).length, 0);
  });
  await test('recordatorio temprano no es elegible antes de su hora', async () => {
    const r = await compra(1500);
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios', [
      new Date(Date.parse(r.inicio) - 86400000 + 60000).toISOString(),
    ]);
    const e = (await eventos()).find((e) => e.reserva_id === r.id);
    assert(e);
    assert.equal(await rpc('cine_push_vigente', [e.id, new Date().toISOString()]), false);
    assert.deepEqual(await lote(), []);
  });
  await test('vencimiento de outbox descarta antes del envío', async () => {
    const r = await compra();
    await actor(null, 'service_role');
    await rpc('cine_push_recordatorios');
    await owner();
    await q(
      "update public.cine_push_eventos set vence=clock_timestamp()-interval '1 second' where reserva_id=$1",
      [r.id],
    );
    assert.deepEqual(await lote(), []);
  });
  // Cron/pg_net/Vault NO existen como servicios en PGlite: contrato estructural con mocks explícitos.
  await owner();
  await db.exec(`create schema net;create schema vault;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table net.pedidos(id bigserial primary key,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
      declare v bigint;begin insert into net.pedidos(url,headers,body,timeout_milliseconds) values($1,$2,$3,$4) returning id into v;return v;end$$;`);
  const cronSql = fs
    .readFileSync(path.join(__dirname, '../supabase/comprobaciones/activar-web-push.sql'), 'utf8')
    .replace('create extension if not exists pg_net with schema extensions;', '');
  await test('Cron sin secreto se rechaza sin instalación parcial', async () => {
    await assert.rejects(() => db.exec(cronSql), /secreto válido/);
    await db.exec('rollback');
    assert.equal(
      (await q("select count(*)::int n from cron.job where jobname='cine-web-push'")).n,
      0,
    );
  });
  await test('Cron usa Vault, secreto fuera del comando y cada minuto', async () => {
    await q(
      "insert into vault.decrypted_secrets values('cine_push_dispatch_secret','solo-prueba-local-no-secreto-real-123456789')",
    );
    await db.exec(cronSql);
    const j = await q("select * from cron.job where jobname='cine-web-push'");
    assert.equal(j.schedule, '* * * * *');
    assert.equal(j.command, 'select public.cine_push_invocar();');
    assert(!j.command.includes('123456789'));
    await rpc('cine_push_invocar');
    const req = await q('select * from net.pedidos');
    assert.equal(req.url, 'https://prueba.supabase.co/functions/v1/enviar-push');
    assert.equal(req.timeout_milliseconds, 60000);
    assert.deepEqual(req.body, {});
    assert.equal(Object.keys(req.headers).length, 2);
  });
  await test('invocador Cron privado a todos los roles API', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await actor(role === 'authenticated' ? admin : null, role);
      await assert.rejects(() => rpc('cine_push_invocar'), /permission denied/);
    }
  });
  await test('Push pausado no genera HTTP desde Cron', async () => {
    await owner();
    await q('update public.cine_push_config set habilitado=false');
    assert.equal(await rpc('cine_push_invocar'), null);
    assert.equal((await q('select count(*)::int n from net.pedidos')).n, 1);
  });
  console.log(
    `Web Push SQL: ${casos} escenarios locales aprobados; RLS/grants, consentimiento, cola, eventos, leases/reintentos, expiración y conservación. Sin red ni concurrencia multiconexión.`,
  );
};
