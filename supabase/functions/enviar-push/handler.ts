// Handler con dependencias inyectadas: tests sin red, secretos ni backend reales.
export type EventoPush = 'venta' | 'recordatorio_24' | 'recordatorio_2' | 'ingreso' | 'candy';
export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface TrabajoPush {
  id: string;
  lease: string;
  tipo: EventoPush;
  pelicula_id: string | null;
  vence: string;
  origen: string;
  suscripcion: SuscripcionPush;
}
export type ResultadoPush = 'enviado' | 'expirada' | 'reintento' | 'fallo' | 'descartado';
export class SuscripcionInvalida extends Error {}
export interface DependenciasPush {
  secreto: string;
  clavePublica: string;
  origen: string;
  ahora: () => number;
  rpc: (nombre: string, datos: Record<string, unknown>) => Promise<unknown>;
  enviar: (s: SuscripcionPush, payload: string, ttl: number) => Promise<Response>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const eventos: readonly string[] = [
  'venta',
  'recordatorio_24',
  'recordatorio_2',
  'ingreso',
  'candy',
];
function objeto(d: unknown): Record<string, unknown> {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Contrato Push inválido');
  return d as Record<string, unknown>;
}
export function endpointValido(endpoint: string): boolean {
  if (endpoint.length > 2048 || /[\s#]/.test(endpoint)) return false;
  return (
    /^https:\/\/fcm\.googleapis\.com\/fcm\/send\/[A-Za-z0-9_:%./?=&+~-]+$/.test(endpoint) ||
    /^https:\/\/updates\.push\.services\.mozilla\.com\/wpush\/v[12]\/[A-Za-z0-9_:%./?=&+~-]+$/.test(
      endpoint,
    ) ||
    /^https:\/\/web\.push\.apple\.com\/[A-Za-z0-9_:%./?=&+~-]+$/.test(endpoint) ||
    /^https:\/\/[a-z0-9-]+\.notify\.windows\.com\/[A-Za-z0-9_:%./?=&+~-]+$/.test(endpoint)
  );
}
function bytes(clave: string): Uint8Array {
  return Uint8Array.from(atob(clave.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
}
export function leerTrabajo(dato: unknown): TrabajoPush {
  const d = objeto(dato),
    s = objeto(d.suscripcion),
    k = objeto(s.keys);
  if (
    typeof d.id !== 'string' ||
    !uuid.test(d.id) ||
    typeof d.lease !== 'string' ||
    !uuid.test(d.lease) ||
    typeof d.tipo !== 'string' ||
    !eventos.includes(d.tipo) ||
    typeof d.vence !== 'string' ||
    !Number.isFinite(Date.parse(d.vence)) ||
    typeof d.origen !== 'string' ||
    !/^https:\/\/[a-zA-Z0-9.-]+(:[0-9]{1,5})?$/.test(d.origen) ||
    (d.tipo === 'venta' && (typeof d.pelicula_id !== 'string' || !uuid.test(d.pelicula_id))) ||
    typeof s.endpoint !== 'string' ||
    !endpointValido(s.endpoint) ||
    typeof k.p256dh !== 'string' ||
    !/^B[A-Za-z0-9_-]{86}$/.test(k.p256dh) ||
    typeof k.auth !== 'string' ||
    !/^[A-Za-z0-9_-]{22}$/.test(k.auth)
  )
    throw new Error('Contrato Push inválido');
  const pub = bytes(k.p256dh),
    auth = bytes(k.auth);
  if (pub.length !== 65 || pub[0] !== 4 || auth.length !== 16)
    throw new Error('Claves Push inválidas');
  return {
    id: d.id,
    lease: d.lease,
    tipo: d.tipo as EventoPush,
    pelicula_id: d.tipo === 'venta' ? (d.pelicula_id as string) : null,
    vence: d.vence,
    origen: d.origen,
    suscripcion: { endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } },
  };
}
export function payloadPush(j: TrabajoPush): string {
  // Nunca incluir título privado, sala, correo, QR, JWT ni enlace portador de la compra.
  return JSON.stringify({
    version: 1,
    tipo: 'cine-push',
    evento: j.tipo,
    tag: 'cine-push-' + j.id,
    vence: Date.parse(j.vence),
    destino: j.tipo === 'venta' ? '/peliculas/' + j.pelicula_id : '/perfil/compras',
  });
}
export function esperaRetry(value: string | null, ahora: number): number {
  if (!value) return 0;
  const n = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - ahora) / 1000;
  return Number.isFinite(n) ? Math.min(86400, Math.max(0, Math.ceil(n))) : 0;
}
async function secretoIgual(a: string, b: string): Promise<boolean> {
  if (a.length < 32 || b.length < 32 || a.length > 256 || b.length > 256) return false;
  const hash = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diferencia = 0;
  for (let i = 0; i < x.length; i++) diferencia |= x[i] ^ y[i];
  return diferencia === 0;
}
export function crearEmisor(d: DependenciasPush): (req: Request) => Promise<Response> {
  return async (req) => {
    const responder = (status: number, body: Record<string, unknown>) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    // Exclusivo scheduler/backend. Ni CORS público, ni acceso con clave anon/JWT de cliente.
    if (req.headers.has('origin')) return responder(403, { error: 'Acceso denegado' });
    if (req.method !== 'POST') return responder(405, { error: 'Usá POST' });
    if (!(await secretoIgual(req.headers.get('x-cine-push-secret') ?? '', d.secreto)))
      return responder(401, { error: 'Acceso denegado' });
    if (
      !/^B[A-Za-z0-9_-]{86}$/.test(d.clavePublica) ||
      !/^https:\/\/[a-zA-Z0-9.-]+(:[0-9]{1,5})?$/.test(d.origen)
    ) {
      return responder(503, { error: 'Emisor no configurado' });
    }
    let bruto: unknown;
    try {
      bruto = await d.rpc('cine_push_tomar_lote', { p_clave: d.clavePublica, p_limite: 20 });
    } catch {
      return responder(503, { error: 'No se pudo obtener el lote' });
    }
    if (!Array.isArray(bruto) || bruto.length > 20)
      return responder(503, { error: 'Contrato del lote inválido' });
    const resumen = { enviados: 0, reintentos: 0, descartados: 0, fallidos: 0, pendientes: 0 };
    let siguiente = 0;
    const procesar = async (dato: unknown) => {
      // Un registro inválido no debe producir tráfico externo ni exponer datos en errores.
      let identidad: Record<string, unknown>;
      try {
        identidad = objeto(dato);
      } catch {
        resumen.pendientes++;
        return;
      }
      if (
        typeof identidad.id !== 'string' ||
        !uuid.test(identidad.id) ||
        typeof identidad.lease !== 'string' ||
        !uuid.test(identidad.lease)
      ) {
        resumen.pendientes++;
        return;
      }
      let resultado: ResultadoPush = 'fallo',
        http: number | null = null,
        espera = 0;
      try {
        const j = leerTrabajo(dato);
        if (j.origen !== d.origen || Date.parse(j.vence) <= d.ahora()) resultado = 'descartado';
        else if (
          (await d.rpc('cine_push_autorizar_envio', { p_id: j.id, p_lease: j.lease })) !== true
        )
          resultado = 'descartado';
        else if (Date.parse(j.vence) - d.ahora() < 1000) resultado = 'descartado';
        else {
          const ttl = Math.min(
            86400,
            Math.max(1, Math.floor((Date.parse(j.vence) - d.ahora()) / 1000)),
          );
          let respuesta: Response;
          try {
            respuesta = await d.enviar(j.suscripcion, payloadPush(j), ttl);
          } catch (e: unknown) {
            respuesta = new Response(null, {
              status: e instanceof SuscripcionInvalida ? 422 : 503,
            });
          }
          http = respuesta.status;
          if (respuesta.ok) resultado = 'enviado';
          else if (http === 404 || http === 410) resultado = 'expirada';
          else if (http === 408 || http === 429 || http >= 500) {
            resultado = 'reintento';
            espera = esperaRetry(respuesta.headers.get('retry-after'), d.ahora());
          } else resultado = 'fallo';
          // No leer ni registrar el cuerpo del proveedor (puede contener endpoint/credenciales).
          await respuesta.body?.cancel().catch(() => undefined);
        }
      } catch {
        // Fallos de autorización RPC no deben consumir la entrega como un error definitivo.
        try {
          leerTrabajo(dato);
          resultado = 'reintento';
        } catch {
          resultado = 'fallo';
        }
      }
      try {
        const confirmado = await d.rpc('cine_push_finalizar', {
          p_id: identidad.id,
          p_lease: identidad.lease,
          p_resultado: resultado,
          p_http: http,
          p_espera: espera,
        });
        if (confirmado !== true) {
          resumen.pendientes++;
          return;
        }
        if (resultado === 'enviado') resumen.enviados++;
        else if (resultado === 'reintento') resumen.reintentos++;
        else if (resultado === 'expirada' || resultado === 'descartado') resumen.descartados++;
        else resumen.fallidos++;
      } catch {
        resumen.pendientes++;
      } // Lease recuperable tras caída/respuesta perdida.
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(4, bruto.length) }, async () => {
          while (siguiente < bruto.length) await procesar(bruto[siguiente++]);
        }),
      );
    } catch {
      return responder(503, { error: 'No se pudo procesar el lote' });
    }
    return responder(200, resumen);
  };
}
