// Biblioteca mantenida para RFC 8291 (aes128gcm) y RFC 8292 (VAPID).
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import { createECDH } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { endpointValido, SuscripcionInvalida, SuscripcionPush } from './handler.ts';

export function crearTransporte(
  publicKey: string,
  privateKey: string,
  subject: string,
  red: typeof fetch = fetch,
) {
  if (
    !/^B[A-Za-z0-9_-]{86}$/.test(publicKey) ||
    !/^[A-Za-z0-9_-]{43}$/.test(privateKey) ||
    !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)
  )
    throw new Error('VAPID no configurado');
  try {
    const ec = createECDH('prime256v1');
    // Edge puede usar un shim Node sin soporte de encoding base64url en ECDH.
    ec.setPrivateKey(Buffer.from(privateKey.replaceAll('-', '+').replaceAll('_', '/'), 'base64'));
    const derivada = ec
      .getPublicKey(undefined, 'uncompressed')
      .toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    if (derivada !== publicKey) throw new Error('Par VAPID inválido');
  } catch {
    throw new Error('Par VAPID inválido');
  }
  const detalles = (suscripcion: SuscripcionPush, payload: string, ttl: number) =>
    webpush.generateRequestDetails(suscripcion, payload, {
      vapidDetails: { publicKey, privateKey, subject },
      TTL: ttl,
      contentEncoding: 'aes128gcm',
      urgency: 'normal',
    });
  // Comprobar también el cifrado en el runtime Cloud, no solo derivar la clave.
  // Solo genera bytes en memoria; no hay red, suscripción real, logs ni notificación.
  try {
    const prueba = detalles(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/cine-compatibilidad-runtime',
        keys: { p256dh: publicKey, auth: 'AQEBAQEBAQEBAQEBAQEBAQ' },
      },
      '{}',
      60,
    );
    if (!prueba.body?.length || !prueba.headers['Authorization'])
      throw new Error('Contrato criptográfico inválido');
  } catch {
    throw new Error('Runtime no compatible con cifrado Web Push');
  }
  return async (suscripcion: SuscripcionPush, payload: string, ttl: number): Promise<Response> => {
    if (
      !endpointValido(suscripcion.endpoint) ||
      new TextEncoder().encode(payload).length > 3000 ||
      !Number.isInteger(ttl) ||
      ttl < 1 ||
      ttl > 86400
    )
      throw new Error('Envío Push inválido');
    let pedido;
    try {
      pedido = detalles(suscripcion, payload, ttl);
    } catch {
      throw new SuscripcionInvalida('Suscripción Push inválida');
    }
    // fetch acotado y SIN seguir redirects; no convertir el Push Service en proxy a otro host.
    return await red(pedido.endpoint, {
      method: 'POST',
      headers: pedido.headers,
      body: new Uint8Array(pedido.body ?? []),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  };
}
