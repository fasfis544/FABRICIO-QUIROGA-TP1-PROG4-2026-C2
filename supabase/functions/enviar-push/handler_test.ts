import { strict as assert } from 'node:assert';
import { createECDH, randomBytes } from 'node:crypto';
import {
  crearEmisor,
  DependenciasPush,
  endpointValido,
  esperaRetry,
  leerTrabajo,
  payloadPush,
  SuscripcionInvalida,
  TrabajoPush,
} from './handler.ts';
const ahora = Date.parse('2030-01-01T12:00:00Z');
const ec = createECDH('prime256v1');
ec.generateKeys();
const clave = ec.getPublicKey().toString('base64url');
const secreto = 'test-dispatch-no-real-'.repeat(3);
const job = (tipo: TrabajoPush['tipo'] = 'recordatorio_24'): TrabajoPush => ({
  id: crypto.randomUUID(),
  lease: crypto.randomUUID(),
  tipo,
  pelicula_id: tipo === 'venta' ? crypto.randomUUID() : null,
  vence: new Date(ahora + 600000).toISOString(),
  origen: 'https://cine.example',
  suscripcion: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/prueba-local',
    keys: { p256dh: clave, auth: randomBytes(16).toString('base64url') },
  },
});
function preparar(jobs: unknown[] = [job()]) {
  const llamadas: { nombre: string; datos: Record<string, unknown> }[] = [],
    enviados: { s: unknown; payload: string; ttl: number }[] = [];
  const d: DependenciasPush = {
    secreto,
    clavePublica: clave,
    origen: 'https://cine.example',
    ahora: () => ahora,
    rpc: async (nombre, datos) => {
      llamadas.push({ nombre, datos });
      if (nombre === 'cine_push_tomar_lote') return jobs;
      if (nombre === 'cine_push_autorizar_envio' || nombre === 'cine_push_finalizar') return true;
      throw Error('RPC inesperada');
    },
    enviar: async (s, payload, ttl) => {
      enviados.push({ s, payload, ttl });
      return new Response(null, { status: 201 });
    },
  };
  const request = (headers: Record<string, string> = {}, method = 'POST') =>
    new Request('https://prueba.supabase.co/functions/v1/enviar-push', {
      method,
      headers: { 'x-cine-push-secret': secreto, ...headers },
    });
  return { d, llamadas, enviados, request, run: () => crearEmisor(d)(request()) };
}
for (const endpoint of [
  'https://fcm.googleapis.com/fcm/send/ejemplo',
  'https://updates.push.services.mozilla.com/wpush/v2/ejemplo',
  'https://web.push.apple.com/ejemplo',
  'https://wns2.notify.windows.com/w/?token=ejemplo',
])
  Deno.test('endpoint permitido ' + new URL(endpoint).hostname, () =>
    assert(endpointValido(endpoint)),
  );
for (const endpoint of [
  'http://fcm.googleapis.com/fcm/send/x',
  'https://127.0.0.1/push',
  'https://169.254.169.254/latest/meta-data',
  'https://fcm.googleapis.com.evil.test/fcm/send/x',
  'https://user@fcm.googleapis.com/fcm/send/x',
  'https://fcm.googleapis.com:444/fcm/send/x',
  'https://fcm.googleapis.com/fcm/send/x#fragmento',
  'https://evil.test',
  'file:///secreto',
])
  Deno.test('SSRF rechazado ' + new URL(endpoint).hostname, () =>
    assert.equal(endpointValido(endpoint), false),
  );
Deno.test('handler secreto válido, payload mínimo y TTL', async () => {
  const t = preparar();
  const r = await t.run();
  assert.equal(r.status, 200);
  assert.equal((await r.json()).enviados, 1);
  assert.equal(t.enviados.length, 1);
  assert.equal(t.enviados[0].ttl, 600);
  assert.deepEqual(Object.keys(JSON.parse(t.enviados[0].payload)).sort(), [
    'destino',
    'evento',
    'tag',
    'tipo',
    'vence',
    'version',
  ]);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
for (const header of ['', 'anon-publica', 'Bearer cliente', 'x'.repeat(300)])
  Deno.test('secreto faltante/falso no toca DB ni red', async () => {
    const t = preparar();
    const r = await crearEmisor(t.d)(t.request({ 'x-cine-push-secret': header }));
    assert.equal(r.status, 401);
    assert.equal(t.llamadas.length, 0);
    assert.equal(t.enviados.length, 0);
  });
Deno.test('navegador se rechaza incluso con secreto', async () => {
  const t = preparar();
  const r = await crearEmisor(t.d)(t.request({ origin: 'https://cine.example' }));
  assert.equal(r.status, 403);
  assert.equal(t.llamadas.length, 0);
});
Deno.test('GET/OPTIONS no procesa', async () => {
  for (const metodo of ['GET', 'OPTIONS']) {
    const t = preparar();
    assert.equal((await crearEmisor(t.d)(t.request({}, metodo))).status, 405);
    assert.equal(t.llamadas.length, 0);
  }
});
Deno.test('configuración incompleta devuelve 503', async () => {
  const t = preparar();
  t.d.clavePublica = '';
  assert.equal((await t.run()).status, 503);
  assert.equal(t.llamadas.length, 0);
});
Deno.test('lote vacío no envía', async () => {
  const t = preparar([]);
  assert.equal((await t.run()).status, 200);
  assert.equal(t.enviados.length, 0);
});
Deno.test('lote máximo o formato inválido no produce red', async () => {
  for (const data of [new Array(21).fill(job()), {}, null]) {
    const t = preparar();
    t.d.rpc = async () => data;
    assert.equal((await t.run()).status, 503);
    assert.equal(t.enviados.length, 0);
  }
});
Deno.test('fallo DB no expone mensajes internos', async () => {
  const t = preparar();
  t.d.rpc = async () => {
    throw Error('ENDPOINT-Y-SECRETO');
  };
  const r = await t.run();
  assert.equal(r.status, 503);
  assert(!(await r.text()).includes('SECRETO'));
});
Deno.test('autorización caducada/revocada no envía', async () => {
  const t = preparar();
  const rpc = t.d.rpc;
  t.d.rpc = (n, d) => (n === 'cine_push_autorizar_envio' ? Promise.resolve(false) : rpc(n, d));
  await t.run();
  assert.equal(t.enviados.length, 0);
  assert.equal(t.llamadas.at(-1)?.datos.p_resultado, 'descartado');
});
Deno.test('expiración en worker backend no envía', async () => {
  const j = job();
  j.vence = new Date(ahora).toISOString();
  const t = preparar([j]);
  await t.run();
  assert.equal(t.enviados.length, 0);
  assert.equal(t.llamadas.at(-1)?.datos.p_resultado, 'descartado');
});
Deno.test('origen distinto no envía', async () => {
  const j = job();
  j.origen = 'https://otro.example';
  const t = preparar([j]);
  await t.run();
  assert.equal(t.enviados.length, 0);
  assert.equal(t.llamadas.at(-1)?.datos.p_resultado, 'descartado');
});
Deno.test('vence mientras se revalida autorización: no enviar tarde', async () => {
  const j = job();
  const t = preparar([j]);
  let fecha = ahora;
  const rpc = t.d.rpc;
  t.d.ahora = () => fecha;
  t.d.rpc = async (n, d) => {
    const r = await rpc(n, d);
    if (n === 'cine_push_autorizar_envio') fecha = ahora + 600000;
    return r;
  };
  await t.run();
  assert.equal(t.enviados.length, 0);
  assert.equal(t.llamadas.at(-1)?.datos.p_resultado, 'descartado');
});
for (const status of [404, 410, 400, 401, 403, 413, 408, 429, 500, 503])
  Deno.test('clasifica HTTP ' + status, async () => {
    const t = preparar();
    t.d.enviar = async () =>
      new Response('NO EXPONER', { status, headers: { 'Retry-After': '120' } });
    const r = await t.run();
    assert.equal(r.status, 200);
    const resultado = t.llamadas.at(-1)?.datos.p_resultado;
    assert.equal(
      resultado,
      [404, 410].includes(status)
        ? 'expirada'
        : [408, 429, 500, 503].includes(status)
          ? 'reintento'
          : 'fallo',
    );
    assert(!(await r.text()).includes('NO EXPONER'));
  });
Deno.test('error de red es recuperable', async () => {
  const t = preparar();
  t.d.enviar = async () => {
    throw Error('endpoint privado');
  };
  await t.run();
  assert.equal(t.llamadas.at(-1)?.datos.p_resultado, 'reintento');
});
Deno.test('clave de suscripción no válida criptográficamente es fallo permanente', async () => {
  const t = preparar();
  t.d.enviar = async () => {
    throw new SuscripcionInvalida('No exponer');
  };
  await t.run();
  assert.equal(t.llamadas.at(-1)?.datos.p_resultado, 'fallo');
});
Deno.test('fallo de autorización RPC reintenta sin red', async () => {
  const t = preparar();
  const rpc = t.d.rpc;
  t.d.rpc = (n, d) => (n === 'cine_push_autorizar_envio' ? Promise.reject(Error('DB')) : rpc(n, d));
  await t.run();
  assert.equal(t.enviados.length, 0);
  assert.equal(t.llamadas.at(-1)?.datos.p_resultado, 'reintento');
});
Deno.test('ack perdido conserva lease recuperable, no afirma enviado', async () => {
  const t = preparar();
  const rpc = t.d.rpc;
  t.d.rpc = (n, d) => (n === 'cine_push_finalizar' ? Promise.reject(Error('DB')) : rpc(n, d));
  const r = await t.run();
  const counts = await r.json();
  assert.equal(counts.enviados, 0);
  assert.equal(counts.pendientes, 1);
});
Deno.test('lease antigua no afirma entrega confirmada', async () => {
  const t = preparar();
  const rpc = t.d.rpc;
  t.d.rpc = (n, d) => (n === 'cine_push_finalizar' ? Promise.resolve(false) : rpc(n, d));
  const counts = await (await t.run()).json();
  assert.equal(counts.enviados, 0);
  assert.equal(counts.pendientes, 1);
});
Deno.test('registro malformado no bloquea los demás', async () => {
  const t = preparar([
    null,
    {},
    { ...job(), suscripcion: { endpoint: 'https://127.0.0.1', keys: {} } },
    job(),
  ]);
  const r = await t.run();
  assert.equal(r.status, 200);
  assert.equal(t.enviados.length, 1);
});
Deno.test('20 trabajos procesados con concurrencia acotada a cuatro', async () => {
  const t = preparar(Array.from({ length: 20 }, () => job()));
  let activos = 0,
    max = 0,
    total = 0;
  t.d.enviar = async () => {
    activos++;
    max = Math.max(max, activos);
    await new Promise<void>((r) => queueMicrotask(r));
    activos--;
    total++;
    return new Response(null, { status: 201 });
  };
  await t.run();
  assert.equal(total, 20);
  assert(max <= 4);
  assert(max > 1);
});
Deno.test('dos despachadores con claim único no duplican', async () => {
  const t = preparar();
  let tomado = false;
  const j = job();
  const rpc = t.d.rpc;
  t.d.rpc = async (n, d) =>
    n === 'cine_push_tomar_lote' ? (tomado ? [] : ((tomado = true), [j])) : rpc(n, d);
  const handler = crearEmisor(t.d);
  await Promise.all([handler(t.request()), handler(t.request())]);
  assert.equal(t.enviados.length, 1);
});
Deno.test('Retry-After segundos/fecha/inválido y límite', () => {
  assert.equal(esperaRetry('120', ahora), 120);
  assert.equal(esperaRetry(new Date(ahora + 60000).toUTCString(), ahora), 60);
  assert.equal(esperaRetry('mal', ahora), 0);
  assert.equal(esperaRetry('99999999', ahora), 86400);
  assert.equal(esperaRetry('0', ahora), 0);
  assert.equal(esperaRetry(new Date(ahora - 10000).toUTCString(), ahora), 0);
});
for (const tipo of ['venta', 'recordatorio_24', 'recordatorio_2', 'ingreso', 'candy'] as const)
  Deno.test('payload privado ' + tipo, () => {
    const j = job(tipo);
    const raw = {
      ...j,
      token: 'BEARER-SECRETO',
      qr_compra: 'QR-SECRETO',
      email: 'PERSONAL-SECRETO',
    };
    const p = payloadPush(leerTrabajo(raw));
    assert(!p.includes('SECRETO'));
    assert(!p.includes(j.suscripcion.endpoint));
    const d = JSON.parse(p);
    assert.equal(d.destino, tipo === 'venta' ? '/peliculas/' + j.pelicula_id : '/perfil/compras');
  });
