// Worker REAL, red/clients/notificaciones simuladas. No envía Push ni abre URLs reales.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/cine-sw.js'), 'utf8');
const ahora = Date.parse('2030-01-01T12:00:00Z');
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const payload = (evento = 'recordatorio_24') => ({
  tipo: 'cine-push',
  version: 1,
  evento,
  tag: 'cine-push-' + id,
  vence: ahora + 600000,
  destino: evento === 'venta' ? '/peliculas/' + id : '/perfil/compras',
});
function worker({ windows = [], existente = false } = {}) {
  const handlers = {},
    mostradas = [],
    abiertas = [];
  let cerrada = 0;
  vm.runInNewContext(source, {
    URL,
    Headers,
    Response,
    Number,
    Object,
    RegExp,
    Date: class extends Date {
      static now() {
        return ahora;
      }
    },
    fetch: () => {
      throw new Error('No se permite red');
    },
    caches: {},
    importScripts: () => {},
    self: {
      addEventListener: (tipo, fn) => {
        handlers[tipo] = fn;
      },
      location: { origin: 'https://cine.example' },
      registration: {
        getNotifications: async () => (existente || mostradas.length ? [{}] : []),
        showNotification: async (titulo, datos) => {
          mostradas.push(JSON.parse(JSON.stringify({ titulo, datos })));
        },
      },
      clients: {
        matchAll: async () => windows,
        openWindow: async (url) => {
          abiertas.push(url);
        },
      },
    },
  });
  return {
    mostradas,
    abiertas,
    get cerrada() {
      return cerrada;
    },
    async push(d, fallo = false) {
      const pendientes = [];
      let stopped = false;
      handlers.push({
        data:
          d === null
            ? null
            : {
                json: () => {
                  if (fallo) throw Error('JSON');
                  return d;
                },
              },
        stopImmediatePropagation: () => {
          stopped = true;
        },
        waitUntil: (p) => pendientes.push(p),
      });
      await Promise.all(pendientes);
      assert(stopped);
    },
    async click(data) {
      const pendientes = [];
      let stopped = false;
      handlers.notificationclick({
        notification: {
          data,
          close: () => {
            cerrada++;
          },
        },
        stopImmediatePropagation: () => {
          stopped = true;
        },
        waitUntil: (p) => pendientes.push(p),
      });
      await Promise.all(pendientes);
      return stopped;
    },
  };
}
async function main() {
  let casos = 0;
  const test = async (nombre, fn) => {
    await fn();
    casos++;
  };
  for (const evento of ['venta', 'recordatorio_24', 'recordatorio_2', 'ingreso', 'candy'])
    await test(evento, async () => {
      const w = worker();
      await w.push(payload(evento));
      assert.equal(w.mostradas.length, 1);
      assert.equal(w.mostradas[0].titulo, 'Cine Aurora');
      assert.equal(w.mostradas[0].datos.renotify, false);
      assert.deepEqual(w.mostradas[0].datos.data, { cine: 1, destino: payload(evento).destino });
    });
  await test('deduplicación por delivery-id/tag', async () => {
    const w = worker();
    await w.push(payload());
    await w.push(payload());
    assert.equal(w.mostradas.length, 1);
  });
  await test('no reemplaza notificación ya visible', async () => {
    const w = worker({ existente: true });
    await w.push(payload());
    assert.equal(w.mostradas.length, 0);
  });
  const invalidos = [
    null,
    {},
    { ...payload(), version: 2 },
    { ...payload(), evento: '__proto__' },
    { ...payload(), vence: ahora },
    { ...payload(), vence: ahora + 2 * 86400000 },
    { ...payload(), tag: 'QR-SECRETO' },
    { ...payload(), destino: 'https://ajeno.test' },
    { ...payload(), destino: '//ajeno.test' },
    { ...payload(), destino: '/perfil/compras?token=secreto' },
    { ...payload(), destino: '/compra/confirmacion/' + id },
    { ...payload(), destino: '/peliculas/' + id },
    { ...payload('venta'), destino: '/perfil/compras' },
  ];
  for (const d of invalidos)
    await test('payload inválido', async () => {
      const w = worker();
      await w.push(d);
      assert.equal(w.mostradas.length, 0);
    });
  await test('JSON malformado', async () => {
    const w = worker();
    await w.push(payload(), true);
    assert.equal(w.mostradas.length, 0);
  });
  await test('no muestra cuerpos/títulos privados recibidos', async () => {
    const w = worker();
    await w.push({ ...payload(), body: 'QR-SECRETO', title: 'JWT-SECRETO', token: 'PORTADOR' });
    assert(!JSON.stringify(w.mostradas).includes('SECRETO'));
  });
  await test('click abre cuenta del mismo origen', async () => {
    const w = worker();
    assert(await w.click({ cine: 1, destino: '/perfil/compras' }));
    assert.deepEqual(w.abiertas, ['https://cine.example/perfil/compras']);
    assert.equal(w.cerrada, 1);
  });
  await test('click reutiliza ventana y foco', async () => {
    const navegadas = [];
    let focus = 0;
    const w = worker({
      windows: [
        {
          url: 'https://cine.example/auth/login',
          navigate: async (url) => {
            navegadas.push(url);
            return { focus: async () => focus++ };
          },
        },
      ],
    });
    await w.click({ cine: 1, destino: '/peliculas/' + id });
    assert.equal(focus, 1);
    assert.deepEqual(navegadas, ['https://cine.example/peliculas/' + id]);
    assert.equal(w.abiertas.length, 0);
  });
  await test('no navega ventanas ajenas', async () => {
    const w = worker({
      windows: [
        {
          url: 'https://ajeno.test',
          navigate: () => {
            throw Error('No debe llamarse');
          },
        },
      ],
    });
    await w.click({ cine: 1, destino: '/perfil/compras' });
    assert.equal(w.abiertas.length, 1);
  });
  await test('ventana desaparecida tiene fallback', async () => {
    const w = worker({
      windows: [
        {
          url: 'https://cine.example',
          navigate: async () => {
            throw Error('Cerrada');
          },
        },
      ],
    });
    await w.click({ cine: 1, destino: '/perfil/compras' });
    assert.equal(w.abiertas.length, 1);
  });
  await test('click desconocido no interfiere con Angular', async () => {
    const w = worker();
    assert.equal(await w.click({ externo: 1 }), false);
    assert.equal(w.cerrada, 0);
    assert.equal(w.abiertas.length, 0);
  });
  for (const destino of [
    'https://ajeno.test',
    '//ajeno.test',
    '/compra/confirmacion/SECRETO',
    '/perfil/compras?token=SECRETO',
    'javascript:alert(1)',
  ])
    await test('click malicioso usa cuenta segura', async () => {
      const w = worker();
      await w.click({ cine: 1, destino });
      assert.deepEqual(w.abiertas, ['https://cine.example/perfil/compras']);
    });
  console.log(
    `Push worker: ${casos} escenarios locales aprobados; recepción, deduplicación y click seguro. No acredita entrega real.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
