const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async ({ db, q, identity, admin }) => {
  const usuario = randomUUID();
  await db.exec('reset role');
  await q('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
    usuario, 'puntos@example.com', { nombre: 'Puntos', apellido: 'Local', fecha_nacimiento: '1980-01-01',
      grupo_sanguineo: 'O+', color_ojos: 'Marrones', vacaciones_anuales: 14 },
  ]);
  await identity(admin);
  const genero = (await q('select public.cine_guardar_genero($1) id', [{ nombre: 'Puntos', slug: 'puntos', activa: true }])).id;
  const pelicula = (await q('select public.cine_guardar_pelicula($1,$2) id', [{
    titulo: 'Puntos', slug: 'puntos', sinopsis: 'Prueba local', poster_url: '/icons/icon-512x512.png',
    clasificacion: 'ATP', duracion_minutos: 60, fecha_estreno: '2020-01-01', activa: true,
    idioma: 'castellano', formato: '2D',
  }, [genero]])).id;
  await q("select public.cine_guardar_sala('Sala puntos',20,28)");
  let dia = 200;
  const comprar = async ({ precio, credito = 0, cupon = '', invitado = false, candy = [] }) => {
    await identity(admin);
    const funcion = (await q("select public.cine_crear_funcion($1,null,now()+$2*interval '1 day',$3,'castellano','2D') id", [pelicula, dia++, precio])).id;
    await identity(invitado ? null : usuario, invitado ? 'anon' : 'authenticated');
    const cotizacion = (await q('select public.cine_cotizar($1,$2,$3,$4,$5) d', [funcion, ['A1'], candy, cupon, credito])).d;
    const datos = { funcion, butacas: ['A1'], candy, cupon, credito, cotizacion, solicitud: randomUUID(),
      email: 'puntos@example.com', nombre: 'Puntos', edad: true, puntos: 999999 };
    const args = [invitado ? null : usuario, datos, randomUUID(), 'x'.repeat(30)];
    await identity(null, 'service_role');
    const token = (await q('select public.cine_comprar_documento($1,$2,$3,$4) token', args)).token;
    await db.exec('reset role');
    const reserva = await q('select * from public.cine_reservas where token=$1', [token]);
    return { args, token, reserva, cotizacion, funcion };
  };
  const historica = await comprar({ precio: 80 });
  assert.equal(historica.reserva.puntos, 80);
  const snapshot = async () => (await q(`select jsonb_build_object(
    'reservas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_reservas t),
    'movimientos',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_movimientos t),
    'canjes',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_canjes t),
    'recompensas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_recompensas t)) d`)).d;
  const antes = await snapshot();
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261013000100_puntos_por_ocho.sql'), 'utf8');
  await db.exec(migration);
  assert.deepEqual(await snapshot(), antes, 'Activación no modifica saldos, compras ni recompensas');
  await db.exec(migration);
  assert.deepEqual(await snapshot(), antes, 'Reaplicación tampoco modifica datos');
  await identity(null, 'service_role');
  assert.equal((await q('select public.cine_comprar_documento($1,$2,$3,$4) token', historica.args)).token, historica.token);
  await db.exec('reset role');
  assert.deepEqual(await snapshot(), antes, 'Reintento histórico conserva la acreditación original');

  for (const [precio, puntos] of [[0.01, 0], [7.99, 0], [8, 1], [8.01, 1], [15.99, 1], [16, 2], [1000, 125], [26000, 3250]]) {
    const compra = await comprar({ precio });
    assert.equal(compra.cotizacion.a_pagar, precio);
    assert.equal(compra.reserva.puntos, puntos, `floor(${precio}/8), ignorando puntos enviados por cliente`);
    const mov = await q("select count(*)::integer n,coalesce(sum(importe),0) saldo from public.cine_movimientos where reserva_id=$1 and tipo='puntos'", [compra.reserva.id]);
    assert.equal(mov.n, puntos ? 1 : 0);
    assert.equal(Number(mov.saldo), puntos);
    const previo = await snapshot();
    await identity(null, 'service_role');
    assert.equal((await q('select public.cine_comprar_documento($1,$2,$3,$4) token', compra.args)).token, compra.token);
    await db.exec('reset role');
    assert.deepEqual(await snapshot(), previo, 'Reintento no duplica puntos ni movimientos');
    if (precio === 26000) {
      await identity(usuario);
      await q('select public.cine_cancelar($1)', [compra.token]);
      await db.exec('reset role');
      assert.equal(Number((await q("select sum(importe) saldo from public.cine_movimientos where reserva_id=$1 and tipo='puntos'", [compra.reserva.id])).saldo), 0);
    }
  }
  await db.exec('reset role');
  await q("insert into public.cine_movimientos(usuario_id,tipo,importe,motivo) values($1,'credito',10000,'Prueba local')", [usuario]);
  for (const [credito, puntos] of [[200, 100], [1000, 0]]) {
    const compra = await comprar({ precio: 1000, credito });
    assert.equal(compra.reserva.puntos, puntos, 'Crédito utilizado no genera nuevos puntos');
  }
  await db.exec('reset role');
  for (const [porcentaje, codigo] of [[20, 'PUNTOS-20'], [100, 'PUNTOS-GRATIS']]) {
    await q(`insert into public.cine_cupones(codigo,porcentaje,desde,hasta,limite,activo)
      values($1,$2,now()-interval '1 day',now()+interval '1 day',100,true)`, [codigo, porcentaje]);
  }
  const descuento = await comprar({ precio: 1000, cupon: 'PUNTOS-20', credito: 160 });
  assert.equal(descuento.cotizacion.a_pagar, 640);
  assert.equal(descuento.reserva.puntos, 80, 'Descuento y crédito excluidos de la base');
  const gratis = await comprar({ precio: 1000, cupon: 'PUNTOS-GRATIS' });
  assert.equal(gratis.cotizacion.a_pagar, 0);
  assert.equal(gratis.reserva.puntos, 0, 'Entrada gratuita no genera puntos');
  const invitado = await comprar({ precio: 1000, invitado: true });
  assert.equal(invitado.reserva.puntos, 0, 'Invitado sin fidelización');
  await db.exec('reset role');
  const producto = (await q("insert into public.cine_productos(nombre,precio,stock,activo) values('Candy puntos',200,10,true) returning id")).id;
  const candy = await comprar({ precio: 1000, candy: [{ tipo: 'producto', id: producto, cantidad: 2 }] });
  assert.equal(candy.cotizacion.a_pagar, 1400);
  assert.equal(candy.reserva.puntos, 175, 'Incluye candy efectivamente pagado');
  await identity(admin);
  await q("select public.cine_cancelar_funcion($1,'Prueba puntos')", [candy.funcion]);
  await q("select public.cine_cancelar_funcion($1,'Reintento')", [candy.funcion]);
  await db.exec('reset role');
  assert.equal(Number((await q("select sum(importe) saldo from public.cine_movimientos where reserva_id=$1 and tipo='puntos'", [candy.reserva.id])).saldo), 0);
  assert.equal((await q('select stock from public.cine_productos where id=$1', [producto])).stock, 10);
  await identity(usuario);
  const saldos = (await q('select public.cine_mis_beneficios() d')).d;
  assert.equal(Number(saldos.puntos_disponibles), 0, 'Se conserva la protección de compras cancelables');
  for (const role of ['anon', 'authenticated']) {
    await identity(role === 'anon' ? null : usuario, role);
    await assert.rejects(() => q('select public.cine_comprar_documento($1,$2,$3,$4)', gratis.args), /permission denied/);
    await assert.rejects(() => q('select public.cine_confirmar_reserva($1)', [historica.token]), /permission denied/);
  }
  await db.exec('reset role');
  assert.equal((await q('select puntos from public.cine_reservas where token=$1', [historica.token])).puntos, 80);
  await identity(usuario);
  await q('select public.cine_cancelar($1)', [historica.token]);
  await db.exec('reset role');
  assert.equal(Number((await q("select sum(importe) saldo from public.cine_movimientos where reserva_id=$1 and tipo='puntos'", [historica.reserva.id])).saldo), 0, 'Cancelación histórica revierte puntos originales, no recalculados');
  const restaurar = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261014000100_restaurar_puntos_documento.sql'), 'utf8');
  const antesRestaurar = await snapshot();
  await db.exec(restaurar);
  assert.deepEqual(await snapshot(), antesRestaurar, 'Restauración conserva puntos de ambos períodos');
  await db.exec(restaurar);
  assert.deepEqual(await snapshot(), antesRestaurar, 'Reaplicar restauración es inocuo');

  for (const [precio, puntos] of [[0.01, 0], [0.99, 0], [1, 1], [7.99, 7], [8, 8], [15.99, 15], [16, 16], [1000, 1000], [26000, 26000]]) {
      const compra = await comprar({ precio });
      assert.equal(compra.reserva.puntos, puntos, 'Nuevas compras: floor(a_pagar)');
      const antesRetry = await snapshot();
      await identity(null, 'service_role');
      await q('select public.cine_comprar_documento($1,$2,$3,$4)', compra.args);
      await db.exec('reset role');
      assert.deepEqual(await snapshot(), antesRetry);
      if (precio === 26000) {
        await identity(usuario);
        await q('select public.cine_cancelar($1)', [compra.token]);
        await db.exec('reset role');
        assert.equal(Number((await q("select sum(importe) saldo from public.cine_movimientos where reserva_id=$1 and tipo='puntos'", [compra.reserva.id])).saldo), 0);
      }
  }
  console.log('Puntos: historia 1/8 preservada, nuevas compras 1/peso, redondeo, cero/gratis/invitado, descuentos/crédito/candy, reintentos, compensaciones y permisos: OK (SQL local)');
  if (process.argv.includes('--cierre')) {
    const previo = await snapshot();
    await db.exec(restaurar);
    assert.deepEqual(await snapshot(), previo, 'Reaplicar restauración no modifica saldos ni compras');
    await identity(null, 'service_role');
    assert.equal((await q('select public.cine_comprar_documento($1,$2,$3,$4) token', descuento.args)).token, descuento.token);
    await db.exec('reset role');
    assert.deepEqual(await snapshot(), previo, 'Reintento no recalcula ni duplica puntos');
    const combinada = await comprar({ precio: 1000, credito: 160, cupon: 'PUNTOS-20' });
    assert.equal(combinada.reserva.puntos, 640);
    assert.equal((await comprar({ precio: 1000, credito: 1000 })).reserva.puntos, 0);
    assert.equal((await comprar({ precio: 1000, cupon: 'PUNTOS-GRATIS' })).reserva.puntos, 0);
    assert.equal((await comprar({ precio: 1000, invitado: true })).reserva.puntos, 0);
    await identity(usuario);
    await q('select public.cine_cancelar($1)', [descuento.token]);
    await db.exec('reset role');
    assert.equal(Number((await q("select sum(importe) saldo from public.cine_movimientos where reserva_id=$1 and tipo='puntos'", [descuento.reserva.id])).saldo), 0, 'Cancelación revierte exactamente los puntos acreditados');
    console.log('Restauración RF-50/RN-12: historia 1/8 preservada, fórmula vigente 1/peso, límites, gratis/invitado, descuento/crédito, reintentos y cancelaciones: OK');
  }
  await identity(admin);
};
