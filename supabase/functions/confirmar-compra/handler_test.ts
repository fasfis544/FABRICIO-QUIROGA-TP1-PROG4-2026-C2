import { PDFDocument } from 'npm:pdf-lib@1.17.1';
const assert = (condition: boolean, message = 'Assertion failed') => {
  if (!condition) throw new Error(message);
};
const origin = 'http://localhost:4200';
Deno.env.set('SUPABASE_URL', 'http://localhost:9999');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-de-prueba');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'solo-test-no-es-un-secreto');
Deno.env.set('CINE_ORIGENES', origin);
const originalFetch = globalThis.fetch;
const f = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const quote = {
  total: 1000,
  subtotal: 1000,
  descuento: 0,
  credito: 0,
  a_pagar: 1000,
  pelicula: { titulo: 'Película 😀', clasificacion: '18' },
  sala: 'Sala 1',
  funcion: { inicio: '2030-10-10T20:00:00Z', idioma: 'castellano', formato: '2D' },
  entradas: [{ butaca: 'A1', tipo: 'normal', precio: 1000 }],
  candy: [],
};
let operaciones: Record<string, unknown>[] = [];
let previo: Record<string, unknown> | null = null;
let perfilActivo = true;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.origin !== 'http://localhost:9999')
    throw new Error('La prueba no permite conexiones externas');
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  if (url.pathname === '/auth/v1/user') {
    const bearer = new Headers(init?.headers).get('authorization');
    return bearer === 'Bearer usuario-valido'
      ? json({ id: user, email: 'test@example.com' })
      : json({ message: 'Invalid JWT' }, 401);
  }
  if (url.pathname === '/rest/v1/cine_reservas') return json(previo);
  if (url.pathname === '/rest/v1/perfiles') return json({ rol: 'cliente', activo: perfilActivo });
  if (url.pathname === '/rest/v1/rpc/cine_cotizar') return json(quote);
  if (url.pathname === '/rest/v1/rpc/cine_comprar_documento') {
    operaciones.push(JSON.parse(String(init?.body)));
    return json(f);
  }
  throw new Error('Ruta inesperada: ' + url.pathname);
};
const { manejarCompra } = await import('./handler.ts');
const body = {
  funcion: f,
  solicitud: f,
  butacas: ['A1'],
  candy: [],
  cupon: '',
  credito: 0,
  email: 'test@example.com',
  nombre: '',
  edad: true,
  pago_simulado: true,
  total_esperado: 1000,
};
const request = (d: unknown = body, token = 'anon-de-prueba', sitio = origin) =>
  new Request('http://localhost/confirmar-compra', {
    method: 'POST',
    headers: {
      origin: sitio,
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(d),
  });
Deno.test(
  'Edge: validación, Auth, PDF/QR antes de escritura, identidad confiable e idempotencia',
  async () => {
    try {
      assert(
        (await manejarCompra(request(body, 'anon-de-prueba', 'http://no-autorizado'))).status ===
          403,
      );
      assert((await manejarCompra(request({ ...body, pago_simulado: false }))).status === 400);
      assert((await manejarCompra(request(body, 'jwt-invalido'))).status === 401);
      assert((await manejarCompra(request({ ...body, total_esperado: 1 }))).status === 409);
      assert(operaciones.length === 0, 'Los rechazos no deben escribir');
      assert((await manejarCompra(request())).status === 200);
      assert(operaciones.length === 1);
      const commit = operaciones[0];
      assert(commit.p_usuario === null);
      assert(typeof commit.p_qr === 'string' && commit.p_qr !== f);
      const pdf = Uint8Array.from(atob(String(commit.p_pdf)), (c) => c.charCodeAt(0));
      assert(new TextDecoder().decode(pdf.slice(0, 5)) === '%PDF-');
      assert((await PDFDocument.load(pdf)).getPageCount() >= 1);
      const d = commit.p_datos as Record<string, unknown>;
      assert(JSON.stringify(d.cotizacion) === JSON.stringify(quote));
      previo = { token: f, usuario_id: null, pedido: d, pago_simulado: true };
      assert((await manejarCompra(request())).status === 200);
      assert(operaciones.length === 1, 'Un reintento no debe escribir ni emitir otro QR');
      assert((await manejarCompra(request({ ...body, email: 'otro@example.com' }))).status === 409);
      previo = null;
      operaciones = [];
      assert(
        (await manejarCompra(request({ ...body, usuario_id: 'id-falso' }, 'usuario-valido')))
          .status === 200,
      );
      assert(operaciones[0].p_usuario === user, 'No confiar en usuario_id enviado por Angular');
      perfilActivo = false;
      const compraRegistrada = operaciones[0].p_datos;
      previo = { token: f, usuario_id: user, pedido: compraRegistrada, pago_simulado: true };
      assert(
        (await manejarCompra(request(body, 'usuario-valido'))).status === 403,
        'Un perfil inactivo no recupera el token por el reintento privilegiado',
      );
      assert(operaciones.length === 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
