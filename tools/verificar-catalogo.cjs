const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async ({ db, q, identity, admin, cliente, empleado }) => {
  await db.exec('reset role');
  const snapshot = async () => (await q(`select jsonb_build_object(
    'peliculas',(select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.peliculas t),
    'salas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_salas t),
    'funciones',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_funciones t),
    'reservas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_reservas t),
    'movimientos',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_movimientos t),
    'canjes',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_canjes t)) d`)).d;
  const antes = await snapshot();
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261016000200_baja_logica_catalogo.sql'), 'utf8'));
  assert.deepEqual(await snapshot(), antes, 'Instalar la RPC no altera filas');
  const pelicula = (await q(`insert into public.peliculas(titulo,slug,sinopsis,duracion_minutos,clasificacion,fecha_estreno,poster_url,activa,idioma,formato)
    values('Baja local','baja-local','Historia',90,'ATP','2020-01-01','/afiche.png',true,'castellano','2D') returning id`)).id;
  const sala = (await q(`insert into public.cine_salas(nombre,filas,columnas,activa) values('Baja local',20,28,true) returning id`)).id;
  const genero = (await q(`insert into public.generos(nombre,slug) values('Baja local','baja-local') returning id`)).id;
  await q(`insert into public.peliculas_generos(pelicula_id,genero_id) values($1,$2)`, [pelicula, genero]);
  const producto = (await q(`insert into public.cine_productos(nombre,precio,stock) values('Baja local',150,12) returning id`)).id;
  const combo = (await q(`insert into public.cine_combos(nombre,precio) values('Baja local',220) returning id`)).id;
  await q(`insert into public.cine_combo_items(combo_id,producto_id,cantidad) values($1,$2,2)`, [combo, producto]);
  const cupon = (await q(`insert into public.cine_cupones(codigo,porcentaje,desde,hasta,limite)
    values('BAJALOCAL',15,now(),now()+interval '1 day',4) returning id`)).id;
  const recompensa = (await q(`insert into public.cine_recompensas(nombre,puntos,porcentaje,desde,hasta)
    values('Baja local',300,10,now(),now()+interval '1 day') returning id`)).id;
  const campoGenero = (await q(`select case when exists(select 1 from pg_attribute where attrelid='public.generos'::regclass and attname='activo' and not attisdropped) then 'activo' else 'activa' end campo`)).campo;
  const tipos = [
    ['pelicula','peliculas','activa',pelicula], ['sala','cine_salas','activa',sala],
    ['genero','generos',campoGenero,genero], ['producto','cine_productos','activo',producto],
    ['combo','cine_combos','activo',combo], ['cupon','cine_cupones','activo',cupon],
    ['recompensa','cine_recompensas','activa',recompensa],
  ];
  const cambiar = (tipo,id,activo) => q('select public.cine_estado_catalogo($1,$2,$3)', [tipo,id,activo]);
  // El trigger legado actualiza updated_at; no es un cambio de ficha ni de historia.
  const fila = async (tabla,id) => { await db.exec('reset role'); return (await q(`select to_jsonb(t)-'updated_at' d from public.${tabla} t where id=$1`, [id])).d; };
  const contarAuditoria = async (tabla) => {
    await db.exec('reset role');
    return (await q(`select count(*)::int n from public.cine_auditoria
      where tabla=$1 and operacion in('BAJA_CATALOGO','RESTAURAR_CATALOGO')`, [tabla])).n;
  };
  const historia = await snapshot();
  const asociaciones = (await q(`select jsonb_build_object('generos',(select jsonb_agg(to_jsonb(t)) from public.peliculas_generos t where pelicula_id=$1),
    'combo',(select jsonb_agg(to_jsonb(t)) from public.cine_combo_items t where combo_id=$2),
    'butacas',(select jsonb_agg(to_jsonb(t)) from public.cine_butacas_mantenimiento t where sala_id=$3)) d`, [pelicula,combo,sala])).d;
  for (const [tipo,tabla,campo,id] of tipos) {
    const original = await fila(tabla,id);
    for (const actor of [cliente,empleado]) {
      await identity(actor);
      await assert.rejects(() => cambiar(tipo,id,false), /Acceso denegado/);
    }
    await identity(null,'anon');
    await assert.rejects(() => cambiar(tipo,id,false), /permission denied/);
    await identity(admin);
    await cambiar(tipo,id,false);
    assert.deepEqual(await fila(tabla,id), {...original,[campo]:false}, tipo+' modifica solo estado');
    const auditorias = await contarAuditoria(tabla);
    assert.ok(auditorias > 0, 'La baja tiene auditoría explícita');
    await identity(admin);
    await cambiar(tipo,id,false);
    assert.equal(await contarAuditoria(tabla),auditorias,'Baja repetida sin nueva auditoría');
    await identity(admin);
    await cambiar(tipo,id,true);
    assert.deepEqual(await fila(tabla,id),original,tipo+' restaura sin pérdida');
  }
  assert.deepEqual(await snapshot(),historia,'Historia económica, funciones y fichas intactas después de restaurar');
  assert.deepEqual((await q(`select jsonb_build_object('generos',(select jsonb_agg(to_jsonb(t)) from public.peliculas_generos t where pelicula_id=$1),
    'combo',(select jsonb_agg(to_jsonb(t)) from public.cine_combo_items t where combo_id=$2),
    'butacas',(select jsonb_agg(to_jsonb(t)) from public.cine_butacas_mantenimiento t where sala_id=$3)) d`, [pelicula,combo,sala])).d,asociaciones);
  await identity(admin);
  for (const args of [['no-existe',pelicula,false],['pelicula',randomUUID(),false],['pelicula',null,false],['pelicula',pelicula,null]]) {
    await assert.rejects(() => cambiar(...args), /inválido|inexistente|obligatorios/);
  }
  await db.exec('reset role');
  await q('update public.perfiles set activo=false where id=$1',[admin]);
  await identity(admin);
  await assert.rejects(() => cambiar('producto',producto,false),/Acceso denegado/);
  await db.exec('reset role');
  await q('update public.perfiles set activo=true where id=$1',[admin]);
  const funcion = (await q(`insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio)
    values($1,$2,now()+interval '1 day',now()+interval '1 day 2 hours',1000) returning id`,[pelicula,sala])).id;
  const reserva = (await q(`insert into public.cine_reservas(solicitud,funcion_id,email,total,estado)
    values($1,$2,'local@example.test',1000,'pendiente') returning id`,[randomUUID(),funcion])).id;
  for (const estado of ['pendiente','confirmada']) {
    await db.exec('reset role');
    await q('update public.cine_reservas set estado=$1,vence=now()+interval \'1 hour\' where id=$2',[estado,reserva]);
    for (const [inicio,fin] of [["now()+interval '1 day'","now()+interval '1 day 2 hours'"],["now()-interval '1 hour'","now()+interval '1 hour'"]]) {
      await db.exec('reset role');
      await q(`update public.cine_funciones set inicio=${inicio},fin=${fin} where id=$1`,[funcion]);
      const protegida = await snapshot();
      await identity(admin);
      await assert.rejects(() => cambiar('pelicula',pelicula,false),/compras o reservas vigentes/);
      await assert.rejects(() => cambiar('sala',sala,false),/compras o reservas vigentes/);
      await db.exec('reset role');
      assert.deepEqual(await snapshot(),protegida,'Rechazo atómico conserva historial');
    }
  }
  // La reserva expirada no impide retirar; una compra histórica tampoco.
  for (const historica of [false,true]) {
    await db.exec('reset role');
    await q(`update public.cine_reservas set estado=$1,vence=now()-interval '1 hour' where id=$2`,[historica?'confirmada':'pendiente',reserva]);
    if (historica) await q(`update public.cine_funciones set inicio=now()-interval '2 days',fin=now()-interval '1 day' where id=$1`,[funcion]);
    const protegida = await fila('cine_reservas',reserva);
    await identity(admin);
    await cambiar('pelicula',pelicula,false);
    await cambiar('sala',sala,false);
    await identity(null,'anon');
    assert.equal((await q('select public.cine_cartelera() d')).d.some(p=>p.id===pelicula),false);
    assert.equal((await q('select count(*)::int n from public.cine_salas where id=$1',[sala])).n,0);
    assert.deepEqual(await fila('cine_reservas',reserva),protegida);
    await identity(admin);
    await cambiar('pelicula',pelicula,true);
    await cambiar('sala',sala,true);
  }
  console.log('Catálogo: 7 bajas/restauraciones, estado único, permisos, variantes activo/activa, idempotencia, historia, relaciones, compras/reservas futuras/en curso e inactivos públicos: OK (SQL local, sin concurrencia multi-conexión)');
};
