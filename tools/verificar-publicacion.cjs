// Prueba local de la corrección de permisos y configuración SPA; no conecta a Cloud.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;
      create table public.cine_eventos_publicos(id text primary key,revision bigint default 1);
      insert into public.cine_eventos_publicos values('publicacion-local',7);
      alter table public.cine_eventos_publicos enable row level security;
      create policy lectura on public.cine_eventos_publicos for select using(true);
      grant all on public.cine_eventos_publicos to public,anon,authenticated;
      grant insert(id),update(revision),references(id) on public.cine_eventos_publicos to public,anon,authenticated;`);
    const before = (await db.query('select * from public.cine_eventos_publicos')).rows;
    const policies = (
      await db.query("select * from pg_policies where tablename='cine_eventos_publicos'")
    ).rows;
    await db.exec(
      fs.readFileSync(
        path.join(__dirname, '../supabase/migrations/20261017000200_cierre_eventos_publicos.sql'),
        'utf8',
      ),
    );
    assert.deepEqual((await db.query('select * from public.cine_eventos_publicos')).rows, before);
    assert.deepEqual(
      (await db.query("select * from pg_policies where tablename='cine_eventos_publicos'")).rows,
      policies,
    );
    let permissions = 0;
    for (const role of ['anon', 'authenticated']) {
      for (const permission of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        const r = await db.query(
          "select has_table_privilege($1,'public.cine_eventos_publicos',$2) as permitido",
          [role, permission],
        );
        assert.equal(r.rows[0].permitido, permission === 'SELECT');
        permissions++;
      }
      for (const [column, permission] of [
        ['id', 'INSERT'],
        ['revision', 'UPDATE'],
        ['id', 'REFERENCES'],
      ]) {
        const r = await db.query(
          "select has_column_privilege($1,'public.cine_eventos_publicos',$2,$3) as permitido",
          [role, column, permission],
        );
        assert.equal(r.rows[0].permitido, false);
        permissions++;
      }
      await db.exec('set role ' + role);
      assert.deepEqual((await db.query('select * from public.cine_eventos_publicos')).rows, before);
      await assert.rejects(
        () => db.exec('truncate public.cine_eventos_publicos'),
        /permission denied/,
      );
      await db.exec('reset role');
    }
    await db.exec(
      "update public.cine_eventos_publicos set revision=8 where id='publicacion-local'",
    );
    assert.equal(
      (await db.query('select revision from public.cine_eventos_publicos')).rows[0].revision,
      8,
    );
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    assert.equal(config.outputDirectory, 'dist/sistema-cine/browser');
    const route = new RegExp('^' + config.rewrites[0].source + '$');
    for (const url of [
      '/',
      '/perfil/notificaciones',
      '/peliculas/uuid',
      '/auth/oauth',
      '/compra/uuid/checkout',
    ])
      assert(route.test(url));
    for (const url of [
      '/cine-sw.js',
      '/ngsw-worker.js',
      '/ngsw.json',
      '/main.js',
      '/styles.css',
      '/icons/icon-192x192.png',
      '/manifest.webmanifest',
    ])
      assert(!route.test(url));
    const ignore = fs.readFileSync(path.join(__dirname, '../.vercelignore'), 'utf8');
    for (const entry of ['.env.*', '/supabase/', 'src/environments/environment.ts'])
      assert(ignore.split(/\r?\n/).includes(entry));
    console.log(
      `Publicación: ${permissions} controles de privilegios, filas/RLS/lectura/backend conservados y 12 rutas/assets SPA aprobados localmente.`,
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
