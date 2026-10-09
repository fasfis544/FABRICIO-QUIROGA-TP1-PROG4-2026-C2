// Ejecuta el worker real en un contexto aislado; sin navegador ni tráfico externo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/cine-sw.js'), 'utf8');
const endpoint = 'https://prueba.supabase.co/rest/v1/rpc/cine_cartelera';
const now = Date.parse('2030-01-01T12:00:00Z'),
  max = 7 * 86400000;
const response = (text = '[]', timestamp) =>
  new Response(text, {
    headers: {
      'Content-Type': 'application/json',
      ...(timestamp === undefined ? {} : { 'x-cine-cache-date': String(timestamp) }),
    },
  });
function worker({
  stored = null,
  network = async () => response(),
  failOpen = false,
  failPut = false,
} = {}) {
  let listener,
    entry = stored,
    puts = 0,
    requests = 0;
  const messages = [],
    imported = [];
  vm.runInNewContext(source, {
    URL,
    Headers,
    Response,
    Number,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    fetch: (request) => {
      requests++;
      return network(request);
    },
    caches: {
      open: async (name) => {
        assert.equal(name, 'cine-cartelera-v1');
        if (failOpen) throw new Error('CacheStorage no disponible');
        return {
          match: async (key) => {
            assert.equal(key, endpoint);
            return entry?.clone();
          },
          put: async (key, value) => {
            assert.equal(key, endpoint);
            if (failPut) throw new Error('QuotaExceeded');
            puts++;
            entry = value.clone();
          },
        };
      },
    },
    self: {
      addEventListener: (type, value) => {
        assert(['fetch', 'push', 'notificationclick'].includes(type));
        if (type === 'fetch') listener = value;
      },
      clients: {
        matchAll: async () => [{ postMessage: (message) => messages.push(message.tipo) }],
      },
    },
    importScripts: (file) => imported.push(file),
  });
  assert.deepEqual(imported, ['./ngsw-worker.js']);
  return {
    async call(url = endpoint, method = 'GET') {
      let result,
        stopped = false;
      const pending = [];
      listener({
        request: new Request(url, { method }),
        stopImmediatePropagation: () => {
          stopped = true;
        },
        waitUntil: (promise) => pending.push(promise),
        respondWith: (promise) => {
          result = promise;
        },
      });
      const answer = await result;
      await Promise.all(pending);
      return { answer, stopped };
    },
    get puts() {
      return puts;
    },
    get requests() {
      return requests;
    },
    messages,
  };
}
async function main() {
  let scenarios = 0;
  const test = async (_name, run) => {
    await run();
    scenarios++;
  };
  await test('red escribe solo cartelera pública', async () => {
    const w = worker();
    const { answer, stopped } = await w.call();
    assert.equal(answer.status, 200);
    assert(stopped);
    assert.equal(w.puts, 1);
    assert.deepEqual(w.messages, []);
  });
  await test('SWR retorna copia y avisa solo cuando hay cambio', async () => {
    const w = worker({ stored: response('[1]', now - 1000), network: async () => response('[2]') });
    const { answer } = await w.call();
    assert.equal(await answer.text(), '[1]');
    assert.equal(answer.headers.get('x-cine-cached'), 'true');
    assert.deepEqual(w.messages, ['cine-cartelera-actualizada']);
  });
  await test('contenido idéntico no genera bucle de avisos', async () => {
    const w = worker({ stored: response('[]', now - 1000) });
    await w.call();
    assert.deepEqual(w.messages, []);
  });
  await test('offline usa copia reciente sin escrituras', async () => {
    const w = worker({
      stored: response('[1]', now - 1000),
      network: async () => {
        throw new Error('offline');
      },
    });
    const { answer } = await w.call();
    assert.equal(await answer.text(), '[1]');
    assert.equal(w.puts, 0);
  });
  for (const timestamp of [undefined, 'inválido', now + 1000, now - max, now - max - 1]) {
    await test('copia inexistente/vencida/futura/inválida no se ofrece offline', async () => {
      const w = worker({
        stored: response('[1]', timestamp),
        network: async () => {
          throw new Error('offline');
        },
      });
      const { answer } = await w.call();
      assert.equal(answer.status, 503);
    });
  }
  for (const fail of [{ failOpen: true }, { failPut: true }]) {
    await test('almacenamiento no disponible no pierde respuesta válida de red', async () => {
      const w = worker(fail);
      const { answer } = await w.call();
      assert.equal(answer.status, 200);
      assert.equal(await answer.text(), '[]');
    });
  }
  for (const url of [
    endpoint,
    'https://prueba.supabase.co/rest/v1/rpc/cine_mis_beneficios',
    'https://prueba.supabase.co/rest/v1/rpc/cine_mi_reserva',
    'https://prueba.supabase.co/auth/v1/user',
    'https://prueba.supabase.co/functions/v1/confirmar-compra',
    'https://prueba.supabase.co/storage/v1/object/PDF',
    'https://ajeno.test/rest/v1/rpc/cine_cartelera',
  ]) {
    await test('no intercepta POST/privado/ajeno ' + url, async () => {
      const w = worker();
      const { answer, stopped } = await w.call(url, url === endpoint ? 'POST' : 'GET');
      assert.equal(answer, undefined);
      assert.equal(stopped, false);
      assert.equal(w.requests, 0);
      assert.equal(w.puts, 0);
    });
  }
  for (const reply of [
    new Response('{}', { status: 403 }),
    new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
  ]) {
    await test('no cachea error/HTML', async () => {
      const w = worker({ network: async () => reply });
      await w.call();
      assert.equal(w.puts, 0);
    });
  }
  console.log(
    `Worker: ${scenarios} escenarios locales aprobados; caché pública, expiración, privacidad, offline y fallos de almacenamiento. No certifica PWA instalada.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
