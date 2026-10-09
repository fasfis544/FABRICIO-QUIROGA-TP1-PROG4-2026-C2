const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

module.exports = async ({ db, q, identity, admin }) => {
  await identity(admin);
  const genero = (await q('select public.cine_guardar_genero($1) id', [{ nombre: 'Filtros', slug: 'filtros', activa: true }])).id;
  const movie = (await q('select public.cine_guardar_pelicula($1,$2) id', [{
    titulo: 'Filtros', slug: 'filtros', sinopsis: 'Prueba local', poster_url: '/icons/icon-512x512.png',
    clasificacion: 'ATP', duracion_minutos: 60, fecha_estreno: '2020-01-01', idioma: 'castellano', formato: '5D', activa: true,
  }, [genero]])).id;
  const sala = (await q("select public.cine_guardar_sala('Sala filtros',20,28) id")).id;
  const create = async (dias, idioma, formato) => (await q(
    'select public.cine_crear_funcion($1,null,now()+$2*interval \'1 day\',1000,$3,$4) id', [movie,dias,idioma,formato])).id;
  const castellano = await create(160,'castellano','2D');
  const subtitulada = await create(161,'subtitulada','3D');
  await create(162,'castellano','2D');
  await db.exec('reset role');
  const snapshot = async () => (await q(`select jsonb_build_object(
    'peliculas',(select jsonb_agg(to_jsonb(t) order by id) from public.peliculas t),
    'funciones',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_funciones t),
    'reservas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_reservas t)) d`)).d;
  const antes = await snapshot();
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261012000100_filtros_modalidad.sql'),'utf8'));
  assert.deepEqual(await snapshot(),antes,'Migración sin modificación de filas');
  const catalogo = async () => (await q('select public.cine_cartelera() d')).d;
  const pelicula = async () => (await catalogo()).find(p=>p.id===movie);
  await identity(null,'anon');
  let p = await pelicula();
  assert.deepEqual(p.modalidades,[{idioma:'castellano',formato:'2D'},{idioma:'subtitulada',formato:'3D'}]);
  assert.deepEqual(p.idiomas,['castellano','subtitulada']);
  assert.deepEqual(p.formatos,['2D','3D']);
  assert.equal(p.formato,'5D','Metadatos originales no alterados');
  assert.ok(p.modalidades.every(m=>Object.keys(m).sort().join(',')==='formato,idioma'),'Sin datos privados ni IDs');
  await assert.rejects(()=>q('select public.cine_cartelera_modalidad_base()'),/permission denied/);
  await identity(admin);
  assert.deepEqual((await pelicula()).modalidades,p.modalidades);
  await assert.rejects(()=>q('select public.cine_cartelera_modalidad_base()'),/permission denied/);
  await db.exec('reset role');
  await q('update public.cine_funciones set activa=false where id=$1',[subtitulada]);
  await identity(null,'anon');
  assert.deepEqual((await pelicula()).modalidades,[{idioma:'castellano',formato:'2D'}]);
  await db.exec('reset role');
  await q("update public.cine_funciones set inicio=now()-interval '2 days',fin=now()-interval '1 day' where id=$1",[castellano]);
  await identity(null,'anon');
  assert.equal((await pelicula()).modalidades.length,1,'La otra función castellana permanece');
  await db.exec('reset role');
  await q('update public.cine_salas set activa=false where id=$1',[sala]);
  await identity(null,'anon');
  p=await pelicula();
  assert.deepEqual(p.modalidades,[]);
  assert.deepEqual(p.idiomas,[]);
  assert.deepEqual(p.formatos,[]);
  console.log('Filtros: pares reales, duplicados, API anónima/administrador, permisos, salas inactivas, canceladas y pasadas, conservación de datos: OK');
  await identity(admin);
};
