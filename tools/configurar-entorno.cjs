// Genera archivos públicos para Angular desde variables. NUNCA leer service_role aquí.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const local = path.join(root, '.env.local');
if (process.argv.includes('--importar-actual') && !fs.existsSync(local)) {
  const source = fs.readFileSync(path.join(root, 'src/environments/environment.ts'), 'utf8');
  const read = (key) => source.match(new RegExp(`${key}\\s*:\\s*['\"]([^'\"]+)['\"]`))?.[1];
  const url = read('supabaseUrl'),
    key = read('supabaseAnonKey');
  if (!url || !key)
    throw new Error('No se pudo importar la configuración local existente. Usá .env.example.');
  fs.writeFileSync(local, `SUPABASE_URL=${url}\nSUPABASE_ANON_KEY=${key}\n`, { flag: 'wx' });
  console.log('Configuración existente conservada en .env.local (ignorado por Git).');
}
const values = {};
if (fs.existsSync(local)) {
  for (const line of fs.readFileSync(local, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const url = process.env.SUPABASE_URL || values.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || values.SUPABASE_ANON_KEY;
if (!url || !key || !/^https:\/\//.test(url))
  throw new Error('Configurá SUPABASE_URL y SUPABASE_ANON_KEY en .env.local o el hosting.');
if (key.startsWith('sb_secret_')) throw new Error('Nunca usar una clave secreta en Angular.');
if (key.startsWith('eyJ')) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (claims.role !== 'anon')
    throw new Error('Angular acepta solo la clave pública anon, no service_role.');
}
fs.mkdirSync(path.join(root, 'src/environments'), { recursive: true });
for (const production of [false, true]) {
  fs.writeFileSync(
    path.join(
      root,
      'src/environments',
      production ? 'environment.production.ts' : 'environment.ts',
    ),
    `// Generado por configurar-entorno.cjs. Ignorado por Git. Solo valores PUBLICOS.\nexport const environment = ${JSON.stringify({ production, supabaseUrl: url, supabaseAnonKey: key }, null, 2)};\n`,
  );
}
console.log('Entorno público de Angular generado; no se imprimieron claves.');
