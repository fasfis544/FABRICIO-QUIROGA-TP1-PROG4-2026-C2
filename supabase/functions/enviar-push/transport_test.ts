import { strict as assert } from 'node:assert';
import { createECDH, randomBytes } from 'node:crypto';
import { crearTransporte } from './transport.ts';
import { SuscripcionInvalida } from './handler.ts';

Deno.test(
  'comprobación criptográfica de arranque no usa red ni registra dispositivos',
  async () => {
    const f = await fixture();
    let llamadas = 0;
    const red: typeof fetch = async () => {
      llamadas++;
      return new Response(null, { status: 201 });
    };
    const enviar = crearTransporte(f.pub, f.priv, 'mailto:prueba@example.test', red);
    assert.equal(typeof enviar, 'function');
    assert.equal(llamadas, 0);
  },
);
const encode = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const decode = (s: string) =>
  Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const text = (s: string) => new TextEncoder().encode(s);
const concat = (...arrays: Uint8Array[]) => {
  const r = new Uint8Array(arrays.reduce((n, b) => n + b.length, 0));
  let i = 0;
  for (const b of arrays) {
    r.set(b, i);
    i += b.length;
  }
  return r;
};
async function hkdf(
  input: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}
async function fixture() {
  const vapid = createECDH('prime256v1');
  vapid.generateKeys();
  const pub = vapid.getPublicKey().toString('base64url');
  const priv = Buffer.concat([
    Buffer.alloc(32 - vapid.getPrivateKey().length),
    vapid.getPrivateKey(),
  ]).toString('base64url');
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const client = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey)),
    auth = new Uint8Array(randomBytes(16));
  const s = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/solo-prueba-criptografica',
    keys: { p256dh: encode(client), auth: encode(auth) },
  };
  return { pub, priv, receiver, client, auth, s };
}
Deno.test('RFC 8291: payload cifrado se descifra con WebCrypto del receptor', async () => {
  const f = await fixture();
  let packet: Uint8Array<ArrayBuffer> | undefined, headers: Headers | undefined;
  const red: typeof fetch = async (_url, init) => {
    headers = new Headers(init?.headers);
    packet = new Uint8Array(init?.body as Uint8Array);
    assert.equal(init?.redirect, 'error');
    assert(init?.signal);
    return new Response(null, { status: 201 });
  };
  const payload = JSON.stringify({
    tipo: 'cine-push',
    version: 1,
    evento: 'ingreso',
    destino: '/perfil/compras',
  });
  await crearTransporte(f.pub, f.priv, 'mailto:prueba@example.test', red)(f.s, payload, 600);
  assert(packet && headers);
  assert.equal(headers.get('content-encoding'), 'aes128gcm');
  assert.equal(headers.get('ttl'), '600');
  assert.equal(packet[20], 65);
  assert(!new TextDecoder().decode(packet).includes('perfil/compras'));
  const salt = packet.slice(0, 16),
    server = packet.slice(21, 86),
    cipher = packet.slice(86);
  const serverKey = await crypto.subtle.importKey(
    'raw',
    server,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, f.receiver.privateKey, 256),
  );
  const ikm = await hkdf(shared, f.auth, concat(text('WebPush: info\0'), f.client, server), 32);
  const cek = await hkdf(ikm, salt, text('Content-Encoding: aes128gcm\0'), 16),
    nonce = await hkdf(ikm, salt, text('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher),
  );
  let end = plain.length - 1;
  while (plain[end] === 0) end--;
  assert.equal(plain[end], 2);
  assert.equal(new TextDecoder().decode(plain.slice(0, end)), payload);
});
Deno.test('RFC 8292: JWT VAPID firmado, audience/exp/subject correctos', async () => {
  const f = await fixture();
  let headers: Headers | undefined;
  const red: typeof fetch = async (_url, init) => {
    headers = new Headers(init?.headers);
    return new Response(null, { status: 201 });
  };
  await crearTransporte(f.pub, f.priv, 'mailto:prueba@example.test', red)(f.s, '{}', 60);
  assert(headers);
  const authorization = headers.get('authorization')!;
  assert(authorization.startsWith('vapid t='));
  const jwt = /t=([^, ]+)/.exec(authorization)![1],
    parts = jwt.split('.');
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:prueba@example.test');
  assert(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400);
  assert.equal(/k=([^, ]+)/.exec(authorization)![1], f.pub);
  const raw = decode(f.pub);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: encode(raw.slice(1, 33)), y: encode(raw.slice(33)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  assert(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      decode(parts[2]),
      text(parts[0] + '.' + parts[1]),
    ),
  );
});
Deno.test('cifrado nuevo genera salt/clave efímera diferentes', async () => {
  const f = await fixture();
  const packets: Uint8Array[] = [];
  const red: typeof fetch = async (_u, i) => {
    packets.push(new Uint8Array(i?.body as Uint8Array));
    return new Response(null, { status: 201 });
  };
  const send = crearTransporte(f.pub, f.priv, 'mailto:prueba@example.test', red);
  await send(f.s, '{}', 60);
  await send(f.s, '{}', 60);
  assert.notDeepEqual(packets[0], packets[1]);
});
Deno.test('origen SSRF, TTL y tamaño se rechazan antes de la red', async () => {
  const f = await fixture();
  let llamadas = 0;
  const red: typeof fetch = async () => {
    llamadas++;
    return new Response(null, { status: 201 });
  };
  const send = crearTransporte(f.pub, f.priv, 'mailto:prueba@example.test', red);
  await assert.rejects(() => send({ ...f.s, endpoint: 'https://127.0.0.1/x' }, '{}', 60));
  await assert.rejects(() => send(f.s, 'x'.repeat(3001), 60));
  await assert.rejects(() => send(f.s, '{}', 0));
  await assert.rejects(() => send(f.s, '{}', 86401));
  assert.equal(llamadas, 0);
});
Deno.test('pares VAPID mal configurados no arrancan', async () => {
  const f = await fixture(),
    otra = await fixture();
  assert.throws(() => crearTransporte(f.pub, otra.priv, 'mailto:prueba@example.test'));
  assert.throws(() => crearTransporte(f.pub, f.priv, 'http://localhost'));
  assert.throws(() => crearTransporte('', f.priv, 'mailto:prueba@example.test'));
});
Deno.test('punto ECDH inválido es error permanente, no red', async () => {
  const f = await fixture();
  let llamadas = 0;
  const red: typeof fetch = async () => {
    llamadas++;
    return new Response(null, { status: 201 });
  };
  const send = crearTransporte(f.pub, f.priv, 'mailto:prueba@example.test', red);
  const invalida = new Uint8Array(65);
  invalida[0] = 4;
  await assert.rejects(
    () => send({ ...f.s, keys: { ...f.s.keys, p256dh: encode(invalida) } }, '{}', 60),
    SuscripcionInvalida,
  );
  assert.equal(llamadas, 0);
});
