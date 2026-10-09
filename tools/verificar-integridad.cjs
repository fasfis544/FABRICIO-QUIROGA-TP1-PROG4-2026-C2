// Ejecutado por verify:integridad sobre PGlite desechable, nunca Supabase.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async function verificarIntegridad({ db, q, identity, admin, cliente, empleado }) {
  const checks = [];
  const check = async (nombre, accion) => { await accion(); checks.push(nombre); };
  const root = async (sql, args = []) => { await db.exec('reset role'); return q(sql, args); };
  await identity(admin);
  const genero = (await q('select public.cine_guardar_genero($1) id', [
    { nombre: 'Integridad', slug: 'integridad', activa: true },
  ])).id;
  const datos = { titulo: 'Integridad', slug: 'integridad', sinopsis: 'Prueba local',
    poster_url: '/icons/icon-512x512.png', duracion_minutos: 60, clasificacion: 'ATP',
    fecha_estreno: '2020-01-01', idioma: 'castellano', formato: '4D', activa: true };
  const pelicula = (await q('select public.cine_guardar_pelicula($1,$2) id', [datos, [genero]])).id;
  const otra = (await q('select public.cine_guardar_pelicula($1,$2) id', [
    { ...datos, titulo: 'Otra integridad', slug: 'otra-integridad' }, [genero],
  ])).id;
  const sala = (await q("select public.cine_guardar_sala('Sala integridad',20,28) id")).id;
  const create = async (dia, minutos = 0, movie = pelicula) => {
    await identity(admin);
    return (await q(`select public.cine_crear_funcion($1,null,
      date_trunc('day',now())+$2*interval '1 day'+$3*interval '1 minute',1000,'castellano','4D') id`,
      [movie, dia, minutos])).id;
  };
  const future = await create(120);
  // Reserva histórica vencida con contenido conservado: activar no debe reescribirla.
  await root(`insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,total,vence,
    documento_pdf,qr_compra,comprobante_emitido) values($1,$2,$3,'historico@example.test',1000,
    now()-interval '1 day','PDF histórico de prueba',$4,$5)`,
    [randomUUID(), future, cliente, randomUUID(), { funcion: { id: future, formato: '4D' }, total: 1000 }]);
  const snapshot = async () => (await root(`select jsonb_build_object(
    'peliculas',(select jsonb_agg(to_jsonb(t) order by id) from public.peliculas t),
    'funciones',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_funciones t),
    'reservas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_reservas t),
    'asociaciones',(select jsonb_agg(to_jsonb(t) order by pelicula_id,genero_id) from public.peliculas_generos t),
    'auditoria',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_auditoria t),
    'catalogo_auditoria',(select jsonb_agg(to_jsonb(t) order by id) from public.eventos_auditoria t)) d`)).d;
  const antes = await snapshot();
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261011000100_integridad_programacion.sql'), 'utf8'));
  await check('Activar migración no cambia filas históricas ni auditoría', async () => assert.deepEqual(await snapshot(), antes));
  const guardar = async (duracion, extras = {}, genres = [genero]) => {
    await identity(admin);
    return q('select public.cine_guardar_pelicula($1,$2) id', [
      { ...datos, id: pelicula, duracion_minutos: duracion, ...extras }, genres,
    ]);
  };
  const row = async (f) => root('select to_jsonb(t) d from public.cine_funciones t where id=$1', [f]);
  await check('Aumentar duración sin ventas recalcula fin con limpieza', async () => {
    await guardar(90);
    const { d } = await row(future);
    assert.equal(Date.parse(d.fin) - Date.parse(d.inicio), 120 * 60000);
  });
  await check('Reducir duración recalcula fin con limpieza', async () => {
    await guardar(30);
    const { d } = await row(future);
    assert.equal(Date.parse(d.fin) - Date.parse(d.inicio), 60 * 60000);
  });
  await guardar(60);
  const consecutiva = await create(120, 90, otra);
  await check('Igualdad exacta fin/inicio permite los 30 minutos de limpieza', async () => {
    await guardar(60);
    assert.equal((await row(future)).d.fin, (await row(consecutiva)).d.inicio);
  });
  await check('Conflicto con otra película revierte duración, título, géneros y fin', async () => {
    const snap = await snapshot();
    await assert.rejects(() => guardar(61, { titulo: 'No guardar' }), /superpone.*limpieza/);
    assert.deepEqual(await snapshot(), snap);
  });
  await check('Una validación base fallida revierte todo el recalculo', async () => {
    const snap = await snapshot();
    await assert.rejects(() => guardar(50, {}, []), /género/);
    assert.deepEqual(await snapshot(), snap);
  });
  await root('update public.cine_funciones set activa=false where id=$1', [consecutiva]);
  await check('Funciones canceladas no ocupan horario ni cambian fin', async () => {
    const original = (await row(consecutiva)).d;
    await guardar(90);
    assert.deepEqual((await row(consecutiva)).d, original);
  });
  await guardar(60);
  const misma = await create(121);
  const misma2 = await create(121, 90);
  await check('También detecta conflicto entre dos funciones de la misma película', async () => {
    await assert.rejects(() => guardar(61), /superpone/);
    assert.equal(Date.parse((await row(misma)).d.fin) - Date.parse((await row(misma)).d.inicio), 90 * 60000);
    assert.equal(Date.parse((await row(misma2)).d.fin) - Date.parse((await row(misma2)).d.inicio), 90 * 60000);
  });
  const pasada = await create(122);
  const cancelada = await create(123);
  await root("update public.cine_funciones set inicio=now()-interval '3 days',fin=now()-interval '3 days'+interval '90 minutes' where id=$1", [pasada]);
  await root('update public.cine_funciones set activa=false where id=$1', [cancelada]);
  await check('Conserva fin de funciones pasadas y canceladas de la película editada', async () => {
    const p = (await row(pasada)).d, c = (await row(cancelada)).d;
    await guardar(50);
    assert.deepEqual((await row(pasada)).d, p);
    assert.deepEqual((await row(cancelada)).d, c);
  });
  await identity(admin);
  const sala2 = (await q("select public.cine_guardar_sala('Sala integridad 2',20,28) id")).id;
  const paralela = await create(120, 0, otra);
  await check('Funciones en otra sala no causan falsos conflictos', async () => {
    const original = (await row(paralela)).d;
    assert.notEqual(original.sala_id, (await row(future)).d.sala_id);
    await guardar(55);
    assert.deepEqual((await row(paralela)).d, original);
  });
  await guardar(50);
  for (const duracion of [null, 0, -1, 601]) {
    await check(`Duración fuera de rango ${duracion} no altera filas`, async () => {
      const snap = await snapshot();
      await assert.rejects(() => guardar(duracion), /Duración permitida/);
      assert.deepEqual(await snapshot(), snap);
    });
  }
  const enCurso = await create(124);
  await root("update public.cine_funciones set inicio=now()-interval '10 minutes',fin=now()+interval '70 minutes' where id=$1", [enCurso]);
  await check('No cambia duración durante una función en curso', async () => {
    await assert.rejects(() => guardar(40), /función en curso/);
  });
  await check('Permite otros campos con duración intacta durante una función en curso', async () => {
    await guardar(50, { titulo: 'Título conservado' });
  });
  await root('update public.cine_funciones set activa=false where id=$1', [enCurso]);
  const pendienteF = await create(125);
  const reserva = (await root(`insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,total,vence)
    values($1,$2,$3,'local@example.test',1000,now()+interval '15 minutes') returning id`,
    [randomUUID(), pendienteF, cliente])).id;
  await check('Reserva pendiente vigente bloquea duración', async () => {
    await assert.rejects(() => guardar(40), /compras o reservas vigentes/);
  });
  const editar = async (f, idioma = 'castellano', formato = '4D', precio = 1000, vip = 25) => {
    await identity(admin);
    return q('select public.cine_editar_funcion($1,$2,$3,$4,$5)', [f, precio, idioma, formato, vip]);
  };
  await check('Reserva pendiente vigente bloquea idioma y formato', async () => {
    await assert.rejects(() => editar(pendienteF, 'subtitulada'), /compras o reservas/);
    await assert.rejects(() => editar(pendienteF, 'castellano', '5D'), /compras o reservas/);
  });
  await root("update public.cine_reservas set vence=now()-interval '1 minute' where id=$1", [reserva]);
  await check('Reserva vencida permite duración y modalidad', async () => {
    await guardar(40);
    await editar(pendienteF, 'subtitulada', '5D');
    assert.equal((await row(pendienteF)).d.formato, '5D');
  });
  await root("update public.cine_reservas set estado='cancelada',vence=now()+interval '1 day' where id=$1", [reserva]);
  await check('Reserva cancelada permite duración y modalidad', async () => {
    await guardar(50);
    await editar(pendienteF);
  });
  const compradaF = await create(126);
  await identity(cliente);
  const cotizacion = (await q("select public.cine_cotizar($1,array['A1'],'[]','',0) d", [compradaF])).d;
  await identity(null, 'service_role');
  const token = (await q('select public.cine_comprar_documento($1,$2,$3,$4) token', [
    cliente, { funcion: compradaF, butacas: ['A1'], candy: [], cupon: '', credito: 0,
      email: 'cliente@example.test', nombre: 'Local', edad: true, solicitud: randomUUID(), cotizacion },
    randomUUID(), 'x'.repeat(30),
  ])).token;
  await identity(admin);
  const recibo = (await q('select public.cine_detalle_reserva($1) d', [token])).d;
  await check('Compra confirmada bloquea ambos cambios de modalidad de forma atómica', async () => {
    const f = (await row(compradaF)).d;
    await assert.rejects(() => editar(compradaF, 'subtitulada', '4D', 2000, 40), /compras o reservas/);
    await assert.rejects(() => editar(compradaF, 'castellano', '3D', 2000, 40), /compras o reservas/);
    assert.deepEqual((await row(compradaF)).d, f);
  });
  await check('Compra confirmada bloquea duración aunque se reduzca', async () => {
    const snap = await snapshot();
    await assert.rejects(() => guardar(40), /compras o reservas vigentes/);
    assert.deepEqual(await snapshot(), snap);
  });
  await check('Cambio de tarifa/VIP conserva recibo histórico con misma modalidad', async () => {
    await editar(compradaF, 'castellano', '4D', 1500, 40);
    assert.equal((await row(compradaF)).d.precio, 1500);
    await identity(admin);
    const actual = (await q('select public.cine_detalle_reserva($1) d', [token])).d;
    assert.deepEqual(actual.funcion, recibo.funcion);
    assert.equal(actual.documento_pdf, recibo.documento_pdf);
    assert.equal(actual.qr_compra, recibo.qr_compra);
    assert.equal(actual.total, recibo.total);
  });
  await check('Permite editar sinopsis/título con duración intacta y compra confirmada', async () => {
    await guardar(50, { titulo: 'Otro título', sinopsis: 'Otra sinopsis' });
  });
  for (const [precio, vip, regex] of [[null, 25, /precio/], [0, 25, /precio/], [-1, 25, /precio/],
    ['NaN', 25, /precio/], ['Infinity', 25, /precio/], [1000, null, /VIP/],
    [1000, 0, /VIP/], [1000, 501, /VIP/], [1000, 'NaN', /VIP/]]) {
    await check(`Rechaza tarifa/VIP inválidos ${precio}/${vip}`, async () => {
      await assert.rejects(() => editar(compradaF, 'castellano', '4D', precio, vip), regex);
    });
  }
  await check('No permite editar modalidades históricas inválidas sin elección explícita', async () => {
    await assert.rejects(() => editar(pendienteF, 'Español'), /idioma y formato/);
    await assert.rejects(() => editar(pendienteF, 'castellano', 'IMAX'), /idioma y formato/);
  });
  await check('No permite editar función cancelada, pasada o inexistente', async () => {
    await assert.rejects(() => editar(cancelada), /activa inexistente/);
    await assert.rejects(() => editar(pasada), /futuras/);
    await assert.rejects(() => editar(randomUUID()), /inexistente/);
  });
  await check('Cierra UPDATE directo y llamada a helper base sin impedir lectura', async () => {
    await identity(admin);
    await assert.rejects(() => q('update public.peliculas set duracion_minutos=1 where id=$1', [pelicula]), /permission denied/);
    await assert.rejects(() => q('select public.cine_guardar_pelicula_integridad_base($1,$2)', [datos, [genero]]), /permission denied/);
    assert.equal((await q('select duracion_minutos from public.peliculas where id=$1', [pelicula])).duracion_minutos, 50);
  });
  for (const inicio of [null, '2000-01-01', 'infinity', '-infinity']) {
    await check(`Crear rechaza inicio ${inicio} con mensaje específico`, async () => {
      await identity(admin);
      await assert.rejects(() => q("select public.cine_crear_funcion($1,null,$2,1000,'castellano','4D')", [pelicula, inicio]), /fecha y hora/);
    });
  }
  await check('Crear rechaza exactamente ahora y precio no finito', async () => {
    await identity(admin);
    await assert.rejects(() => q("select public.cine_crear_funcion($1,null,now(),1000,'castellano','4D')", [pelicula]), /futuras/);
    await assert.rejects(() => q("select public.cine_crear_funcion($1,null,now()+interval '140 days','NaN','castellano','4D')", [pelicula]), /precio/);
  });
  await check('Alta posterior usa la nueva duración y conserva formato', async () => {
    const nueva = (await row(await create(140))).d;
    assert.equal(Date.parse(nueva.fin) - Date.parse(nueva.inicio), 80 * 60000);
    assert.equal(nueva.formato, '4D');
  });
  for (const [id, role] of [[cliente, 'authenticated'], [empleado, 'authenticated'], [null, 'anon']]) {
    await check(`Roles ${id === null ? 'anon' : id === cliente ? 'cliente' : 'empleado'} no editan`, async () => {
      await identity(id, role);
      await assert.rejects(() => q('select public.cine_guardar_pelicula($1,$2)', [{ ...datos, id: pelicula }, [genero]]), /denegado|permission denied/);
      await assert.rejects(() => q("select public.cine_editar_funcion($1,1000,'castellano','4D',25)", [compradaF]), /denegado|permission denied/);
      await assert.rejects(() => q("select public.cine_crear_funcion($1,null,now()+interval '141 days',1000,'castellano','4D')", [pelicula]), /denegado|permission denied/);
    });
  }
  await check('Registra ajuste de duración en auditoría', async () => {
    const r = await root("select count(*)::int n from public.cine_auditoria where operacion='AJUSTAR_DURACION' and registro->>'id'=$1", [pelicula]);
    assert.ok(r.n > 0);
  });
  // Evitar contaminar los reportes de la regresión administrativa posterior.
  await identity(cliente);
  await q('select public.cine_cancelar($1)', [token]);
  await root('delete from public.cine_movimientos where usuario_id=$1', [cliente]);
  await root('update public.cine_funciones set activa=false where pelicula_id=any($1)', [[pelicula, otra]]);
  await identity(admin);
  await q('select public.cine_adaptar_sala($1,$2,false)', [sala, 'Sala integridad']);
  await q('select public.cine_adaptar_sala($1,$2,false)', [sala2, 'Sala integridad 2']);
  console.log(`Integridad: ${checks.length} escenarios SQL locales aprobados (sin concurrencia multi-conexión).`);
};
