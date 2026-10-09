import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { PDFDocument, StandardFonts } from 'npm:pdf-lib@1.17.1';
// @deno-types="npm:@types/qrcode@1.5.6"
import QRCode from 'npm:qrcode@1.5.4';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const origins = (Deno.env.get('CINE_ORIGENES') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const backend = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Pedido {
  funcion: string;
  solicitud: string;
  butacas: string[];
  candy: { tipo: 'producto' | 'combo'; id: string; cantidad: number }[];
  cupon: string;
  credito: number;
  email: string;
  nombre: string;
  edad: boolean;
  pago_simulado: boolean;
  total_esperado: number;
}
function objeto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Pedido inválido');
  return value as Record<string, unknown>;
}
function leerPedido(value: unknown): Pedido {
  const d = objeto(value);
  if (
    typeof d.funcion !== 'string' ||
    !uuid.test(d.funcion) ||
    typeof d.solicitud !== 'string' ||
    !uuid.test(d.solicitud) ||
    !Array.isArray(d.butacas) ||
    d.butacas.length < 1 ||
    d.butacas.length > 8 ||
    !d.butacas.every((v) => typeof v === 'string') ||
    !Array.isArray(d.candy) ||
    d.candy.length > 30 ||
    d.pago_simulado !== true ||
    typeof d.total_esperado !== 'number' ||
    !Number.isFinite(d.total_esperado) ||
    typeof d.email !== 'string' ||
    typeof d.nombre !== 'string' ||
    typeof d.edad !== 'boolean' ||
    typeof d.credito !== 'number' ||
    !Number.isFinite(d.credito) ||
    typeof d.cupon !== 'string'
  )
    throw new Error('Pedido inválido');
  const candy = d.candy.map((value: unknown): Pedido['candy'][number] => {
    const c = objeto(value);
    if (
      (c.tipo !== 'producto' && c.tipo !== 'combo') ||
      typeof c.id !== 'string' ||
      !uuid.test(c.id) ||
      typeof c.cantidad !== 'number' ||
      !Number.isInteger(c.cantidad) ||
      c.cantidad < 1 ||
      c.cantidad > 20
    )
      throw new Error('Candy inválido');
    return { tipo: c.tipo, id: c.id, cantidad: c.cantidad };
  });
  return {
    funcion: d.funcion,
    solicitud: d.solicitud,
    butacas: d.butacas,
    candy,
    cupon: d.cupon,
    credito: d.credito,
    email: d.email,
    nombre: d.nombre,
    edad: d.edad,
    pago_simulado: true,
    total_esperado: d.total_esperado,
  };
}
type Entrada = { butaca: string; tipo: string; precio: number };
type Cotizacion = {
  total: number;
  subtotal: number;
  descuento: number;
  credito: number;
  a_pagar: number;
  pelicula: { titulo: string; clasificacion: string };
  sala: string;
  funcion: { inicio: string; idioma: string; formato: string };
  entradas: Entrada[];
  candy: { nombre: string; cantidad: number; precio: number }[];
};
const pesos = (n: number) => `ARS ${Number(n).toFixed(2)}`;
// Helvetica no soporta emojis: limpiar solamente la representación, no los datos de la compra.
const textoPdf = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ');
/** Ajustar por ancho tipográfico, no por cantidad de letras (una W no mide lo mismo que una i). */
export function lineasPdf(texto: string, medir: (texto: string) => number, ancho = 523): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const letra of textoPdf(texto)) {
    const siguiente = actual + letra;
    if (actual && medir(siguiente) > ancho) {
      lineas.push(actual);
      actual = letra;
    } else actual = siguiente;
  }
  if (actual) lineas.push(actual);
  return lineas;
}
async function documento(c: Cotizacion, codigo: string): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const linea = (s: string) => {
    for (const texto of lineasPdf(s, (value) => font.widthOfTextAtSize(value, 11))) {
      if (y < 50) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(texto, { x: 36, y, size: 11, font });
      y -= 18;
    }
  };
  linea('CINE AURORA - Comprobante de compra');
  linea('PAGO SIMULADO ACADEMICO - NO SE REALIZO NINGUN COBRO REAL');
  linea(c.pelicula.titulo);
  linea(
    `${c.sala} - ${new Date(c.funcion.inicio).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`,
  );
  linea(`${c.funcion.idioma} - ${c.funcion.formato} - Clasificacion ${c.pelicula.clasificacion}`);
  for (const e of c.entradas) linea(`Butaca ${e.butaca} - ${e.tipo} - ${pesos(e.precio)}`);
  if (c.pelicula.clasificacion !== 'ATP')
    linea('Debe asistir acompañado de un adulto. La restriccion etaria sigue vigente.');
  for (const i of c.candy) linea(`${i.cantidad} x ${i.nombre} - ${pesos(i.precio)} por unidad`);
  linea(`Subtotal ${pesos(c.subtotal)} - Descuento ${pesos(c.descuento)}`);
  linea(
    `Total ${pesos(c.total)} - Credito ${pesos(c.credito)} - Pago simulado ${pesos(c.a_pagar)}`,
  );
  linea(`Codigo unico de compra: ${codigo}`);
  linea('Mismo QR para ingreso y candy; cada prestacion se utiliza una sola vez.');
  const dataUrl = await QRCode.toDataURL(codigo, {
    width: 256,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  const png = await pdf.embedPng(dataUrl);
  if (y < 245) {
    page = pdf.addPage([595, 842]);
    y = 800;
  }
  page.drawImage(png, { x: 36, y: y - 200, width: 200, height: 200 });
  const bytes = await pdf.save();
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export const manejarCompra = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin') ?? '';
  const headers = {
    'Access-Control-Allow-Origin': origins.includes(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.includes(origin)) return reply(403, { error: 'Origen no autorizado' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'Usá POST' });
  try {
    if (Number(req.headers.get('content-length') ?? 0) > 20000)
      return reply(413, { error: 'Pedido demasiado grande' });
    const raw = await req.text();
    if (raw.length > 20000) return reply(413, { error: 'Pedido demasiado grande' });
    let d: Pedido;
    try {
      d = leerPedido(JSON.parse(raw) as unknown);
    } catch {
      return reply(400, { error: 'Pedido inválido o pago simulado no aceptado' });
    }
    const authorization = req.headers.get('authorization') ?? '';
    const bearer = authorization.replace(/^Bearer\s+/i, '');
    let usuario: string | null = null;
    // Una sesión inválida nunca se degrada silenciosamente a invitado.
    if (bearer && bearer !== anon) {
      const { data, error } = await backend.auth.getUser(bearer);
      if (error || !data.user)
        return reply(401, { error: 'Sesión inválida. Iniciá sesión nuevamente.' });
      usuario = data.user.id;
    }
    const actor = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${usuario ? bearer : anon}` } },
      auth: { persistSession: false },
    });
    // La identidad Auth no basta: también denegar reintentos si el perfil perdió autorización.
    if (usuario) {
      const { data: perfil, error } = await actor
        .from('perfiles')
        .select('rol,activo')
        .eq('id', usuario)
        .maybeSingle();
      if (
        error ||
        !perfil ||
        perfil.activo !== true ||
        !['cliente', 'empleado', 'administrador'].includes(perfil.rol)
      ) {
        return reply(403, { error: 'Perfil inactivo o no disponible. Contactá al administrador.' });
      }
    }
    // Reintentar una respuesta perdida devuelve el comprobante persistido, aunque hayan cambiado precios.
    const { data: previa, error: lectura } = await backend
      .from('cine_reservas')
      .select('token,usuario_id,pedido,pago_simulado')
      .eq('solicitud', d.solicitud)
      .maybeSingle();
    if (lectura) throw new Error('No se pudo verificar la solicitud');
    const datos = {
      funcion: d.funcion,
      butacas: d.butacas,
      candy: d.candy,
      cupon: String(d.cupon ?? '').trim(),
      credito: d.credito ?? 0,
      email: String(d.email ?? '').trim(),
      nombre: String(d.nombre ?? '').trim(),
      edad: d.edad === true,
      solicitud: d.solicitud,
    };
    if (previa) {
      const pedido = objeto(previa.pedido);
      if (
        !previa.pago_simulado ||
        previa.usuario_id !== usuario ||
        Object.entries(datos).some(
          ([key, value]) => JSON.stringify(pedido[key]) !== JSON.stringify(value),
        ) ||
        objeto(pedido.cotizacion).total !== d.total_esperado
      )
        return reply(409, { error: 'Solicitud ya utilizada para otro pedido' });
      return reply(200, { token: previa.token });
    }
    const { data: quote, error: errorQuote } = await actor.rpc('cine_cotizar', {
      p_funcion: d.funcion,
      p_butacas: d.butacas,
      p_candy: d.candy,
      p_cupon: datos.cupon,
      p_credito: datos.credito,
    });
    if (errorQuote) return reply(409, { error: errorQuote.message });
    if (quote.total !== d.total_esperado)
      return reply(409, { error: 'El precio cambió. Volvé a calcular el total.' });
    const codigo = crypto.randomUUID();
    // QR y PDF se renderizan ANTES de escribir. Si fallan, no se crea ninguna compra.
    const pdf = await documento(quote as Cotizacion, codigo);
    const { data: token, error } = await backend.rpc('cine_comprar_documento', {
      p_usuario: usuario,
      p_datos: { ...datos, cotizacion: quote },
      p_qr: codigo,
      p_pdf: pdf,
    });
    if (error) return reply(409, { error: error.message });
    return reply(200, { token });
  } catch {
    // No escribir cuerpos, JWT, QR ni tokens en logs.
    return reply(500, {
      error: 'No se pudo confirmar la compra. Reintentá con la misma solicitud.',
    });
  }
};
