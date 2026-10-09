const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async ({ db, q, identity, admin, empleado }) => {
  await db.exec('reset role');
  const cliente = randomUUID();
  await q('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [cliente, 'cierre@example.com', {
    nombre: 'Cierre', apellido: 'Local', fecha_nacimiento: '1990-01-01', grupo_sanguineo: 'O+', color_ojos: 'Marrones', vacaciones_anuales: 14,
  }]);
  const snapshot = async () => (await q(`select jsonb_build_object(
    'perfiles',(select jsonb_agg(to_jsonb(t) order by id) from public.perfiles t),
    'generos',(select jsonb_agg(to_jsonb(t) order by id) from public.generos t),
    'peliculas',(select jsonb_agg(to_jsonb(t) order by id) from public.peliculas t),
    'asociaciones',(select jsonb_agg(to_jsonb(t)) from public.peliculas_generos t),
    'funciones',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_funciones t)) d`)).d;
  const antes = await snapshot();
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261014000200_cerrar_escrituras_directas.sql'), 'utf8');
  await db.exec(sql);
  assert.deepEqual(await snapshot(), antes, 'Activación no modifica registros');
  await db.exec(sql);
  assert.deepEqual(await snapshot(), antes, 'Reaplicar no modifica registros');
  for (const id of [admin, cliente, empleado, null]) {
    await identity(id, id ? 'authenticated' : 'anon');
    for (const tabla of ['perfiles', 'generos', 'peliculas', 'peliculas_generos']) {
      for (const operacion of ['INSERT', 'UPDATE', 'DELETE']) {
        const p = await q('select has_table_privilege(current_user,$1,$2) permitido', [`public.${tabla}`, operacion]);
        assert.equal(p.permitido, false);
      }
      const cols = (await db.query(`select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped`, [`public.${tabla}`])).rows;
      for (const c of cols) {
        for (const operacion of ['INSERT', 'UPDATE']) {
          assert.equal((await q('select has_column_privilege(current_user,$1,$2,$3) permitido', [`public.${tabla}`, c.attname, operacion])).permitido, false);
        }
      }
    }
    await assert.rejects(() => q("update public.perfiles set nombre='Bypass' where id=$1", [cliente]), /permission denied/);
    await assert.rejects(() => q("insert into public.generos(nombre,slug) values('Bypass','bypass')"), /permission denied/);
  }
  await identity(cliente);
  await q('select public.cine_completar_perfil($1)', [{ nombre: 'Cliente RPC', apellido: 'Prueba', fecha_nacimiento: '1990-01-01', grupo_sanguineo: 'O+', color_ojos: 'Marrones', vacaciones_anuales: 14 }]);
  await db.exec('reset role');
  assert.equal((await q('select nombre from public.perfiles where id=$1', [cliente])).nombre, 'Cliente RPC');
  await q('update public.perfiles set activo=false where id=$1', [cliente]);
  await identity(cliente);
  await assert.rejects(() => q('select public.cine_completar_perfil($1)', [{ nombre: 'No', apellido: 'Prueba', fecha_nacimiento: '1990-01-01', grupo_sanguineo: 'O+', color_ojos: 'Marrones', vacaciones_anuales: 14 }]), /denegado/);
  await db.exec('reset role');
  await q('update public.perfiles set activo=true where id=$1', [cliente]);
  await identity(admin);
  const genero = (await q('select public.cine_guardar_genero($1) id', [{ nombre: 'Cierre', slug: 'cierre', activa: true }])).id;
  const pelicula = (await q('select public.cine_guardar_pelicula($1,$2) id', [{ titulo: 'Cierre', slug: 'cierre', sinopsis: 'Prueba', poster_url: '/icons/icon-512x512.png', clasificacion: 'ATP', duracion_minutos: 60, fecha_estreno: '2020-01-01', activa: true, idioma: 'castellano', formato: '2D' }, [genero]])).id;
  await q("select public.cine_guardar_sala('Sala cierre',20,28)");
  const funcion = (await q("select public.cine_crear_funcion($1,null,now()+interval '300 days',1000,'castellano','2D') id", [pelicula])).id;
  await identity(null, 'anon');
  assert.equal((await q('select count(*)::integer n from public.cine_funciones where id=$1', [funcion])).n, 1);
  await db.exec('reset role');
  const sala = (await q('select sala_id from public.cine_funciones where id=$1', [funcion])).sala_id;
  await q('update public.cine_salas set activa=false where id=$1', [sala]);
  for (const id of [null, cliente, empleado]) {
    await identity(id, id ? 'authenticated' : 'anon');
    assert.equal((await q('select count(*)::integer n from public.cine_funciones where id=$1', [funcion])).n, 0, 'Sala inactiva no muestra funciones al público');
  }
  await identity(admin);
  assert.equal((await q('select count(*)::integer n from public.cine_funciones where id=$1', [funcion])).n, 1, 'Admin conserva acceso histórico');
  console.log('Cierre: permisos tabla/columna por rol, RPC operativas, perfil inactivo, filas conservadas y visibilidad de sala inactiva: OK');
};
