import { PDFDocument, StandardFonts } from 'npm:pdf-lib@1.17.1';
const assert = (condition: boolean, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
const origin = 'http://localhost:4200';
Deno.env.set('SUPABASE_URL', 'http://localhost:9999');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-prueba');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa-solo-pruebas');
Deno.env.set('CINE_ORIGENES', origin);
const f = '11111111-1111-4111-8111-111111111111';
const body = { funcion: f, solicitud: f, butacas: ['A1'], candy: [], cupon: '', credito: 0, email: 'test@example.com', nombre: '', edad: true, pago_simulado: true, total_esperado: 1000 };
const quote = { total: 1000, subtotal: 1000, descuento: 0, credito: 0, a_pagar: 1000, pelicula: { titulo: 'W'.repeat(150), clasificacion: '18' }, sala: 'Sala 1', funcion: { inicio: '2030-10-10T20:00:00Z', idioma: 'castellano', formato: '2D' }, entradas: [{ butaca: 'A1', tipo: 'normal', precio: 1000 }], candy: [] as { nombre: string; cantidad: number; precio: number }[] };
let writes = 0, fallo = '', pdf = '';
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  assert(url.origin === 'http://localhost:9999', 'No se permite tráfico externo en la prueba');
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/rest/v1/cine_reservas') return json(null);
  if (url.pathname === '/auth/v1/user') return json({ message: 'JWT inválido' }, 401);
  if (url.pathname.endsWith('/cine_cotizar')) return fallo === 'cotizar' ? json({ message: 'Stock insuficiente' }, 409) : json(quote);
  if (url.pathname.endsWith('/cine_comprar_documento')) {
    writes++;
    pdf = (JSON.parse(String(init?.body)) as { p_pdf: string }).p_pdf;
    return fallo === 'comprar' ? json({ message: 'Butaca ocupada' }, 409) : json(f);
  }
  throw new Error('Ruta inesperada: ' + url.pathname);
};
const { manejarCompra, lineasPdf } = await import('./handler.ts');
const request = (value: unknown = body) => new Request('http://localhost/confirmar-compra', { method: 'POST', headers: { origin, authorization: 'Bearer anon-prueba', 'content-type': 'application/json' }, body: JSON.stringify(value) });
for (const [campo, valor] of [
  ['funcion', 'no-uuid'], ['solicitud', ''], ['butacas', []], ['butacas', Array(9).fill('A1')], ['butacas', [1]],
  ['candy', Array(31).fill({ tipo: 'producto', id: f, cantidad: 1 })], ['candy', [{ tipo: 'producto', id: f, cantidad: 1.5 }]],
  ['candy', [{ tipo: 'combo', id: f, cantidad: 21 }]], ['candy', [{ tipo: 'extra', id: f, cantidad: 1 }]],
  ['candy', [{ tipo: 'producto', id: 'inválido', cantidad: 1 }]], ['pago_simulado', false], ['credito', '0'],
  ['email', null], ['edad', 'true'], ['total_esperado', null], ['nombre', null],
] as const) {
  Deno.test(`Pedido adversarial: ${campo}=${JSON.stringify(valor)} no llega a escritura`, async () => {
    const antes = writes; const respuesta = await manejarCompra(request({ ...body, [campo]: valor }));
    assert(respuesta.status === 400); assert(writes === antes);
  });
}
Deno.test('Métodos/CORS y respuestas sin caché', async () => {
  assert((await manejarCompra(new Request('http://localhost', { method: 'GET' }))).status === 405);
  const opciones = await manejarCompra(new Request('http://localhost', { method: 'OPTIONS', headers: { origin } }));
  assert(opciones.status === 204); assert(opciones.headers.get('access-control-allow-origin') === origin);
  const rechazada = await manejarCompra(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'http://ajeno.test' } }));
  assert(rechazada.status === 403); assert(rechazada.headers.get('cache-control') === 'no-store');
});
Deno.test('JSON ilegible o tamaño excesivo se rechazan antes de consultar o escribir', async () => {
  const antes = writes;
  for (const [raw, esperado] of [['{', 400], ['a'.repeat(20001), 413]] as const) {
    const r = await manejarCompra(new Request('http://localhost', { method: 'POST', body: raw })); assert(r.status === esperado);
  }
  assert(writes === antes);
});
Deno.test('Sesión inválida nunca se convierte en compra invitada', async () => {
  const antes = writes; const req = request(); req.headers.set('authorization', 'Bearer falso');
  assert((await manejarCompra(req)).status === 401); assert(writes === antes);
});
Deno.test('Rechazo de cotización no escribe y fallo de compra conserva motivo de negocio', async () => {
  const antes = writes; fallo = 'cotizar';
  assert((await manejarCompra(request())).status === 409); assert(writes === antes);
  fallo = 'comprar'; const r = await manejarCompra(request()); assert(r.status === 409);
  const payload: unknown = await r.json();
  assert(typeof payload === 'object' && payload !== null && 'error' in payload && payload.error === 'Butaca ocupada'); fallo = '';
});
Deno.test('PDF de título ancho/multipágina abre y cada línea respeta el ancho de página', async () => {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  const original = 'W'.repeat(150) + ' - Español áéíóú';
  const lineas = lineasPdf(original, (s) => font.widthOfTextAtSize(s, 11));
  assert(lineas.length > 2); assert(lineas.join('') === original);
  assert(lineas.every((s) => font.widthOfTextAtSize(s, 11) <= 523));
  quote.candy = Array.from({ length: 45 }, (_, i) => ({ nombre: 'Producto ' + i, cantidad: 1, precio: 1 }));
  assert((await manejarCompra(request())).status === 200);
  const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
  assert((await PDFDocument.load(bytes)).getPageCount() > 1);
});
