// Generación LOCAL, sin red. Nunca imprime claves privadas ni sobrescribe claves anteriores.
const fs = require('node:fs');
const path = require('node:path');
const { createECDH, randomBytes } = require('node:crypto');
const destino = path.resolve(__dirname, '../.env.push.local');
if (fs.existsSync(destino))
  throw new Error('Ya existe .env.push.local: no rotar/sobrescribir claves activas.');
const ec = createECDH('prime256v1');
ec.generateKeys();
const privada = Buffer.concat([Buffer.alloc(32 - ec.getPrivateKey().length), ec.getPrivateKey()]);
fs.writeFileSync(
  destino,
  [
    '# Archivo PRIVADO ignorado por Git. Completar origen/contacto antes del despliegue.',
    `CINE_VAPID_PUBLIC_KEY=${ec.getPublicKey().toString('base64url')}`,
    `CINE_VAPID_PRIVATE_KEY=${privada.toString('base64url')}`,
    'CINE_VAPID_SUBJECT=mailto:TU-CORREO@example.com',
    'CINE_PUSH_ORIGEN=https://TU-FRONTEND.example',
    `CINE_PUSH_DISPATCH_SECRET=${randomBytes(32).toString('base64url')}`,
    '',
  ].join('\n'),
  { flag: 'wx', mode: 0o600 },
);
console.log(
  'Claves guardadas en .env.push.local (privado/ignorado). No compartir ni versionar este archivo.',
);
