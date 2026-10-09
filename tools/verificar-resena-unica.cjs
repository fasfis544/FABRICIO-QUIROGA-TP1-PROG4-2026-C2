const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async ({ db, q, identity, admin, cliente, empleado, variante }) => {
  await db.exec('reset role');
  await q('update public.perfiles set activo=true where id=any($1::uuid[])', [[admin, cliente, empleado]]);
  const pelicula = async (slug) => (
    await q(`insert into public.peliculas(titulo,slug,sinopsis,duracion_minutos,clasificacion,fecha_estreno,poster_url,activa,idioma,formato)
      values($1,$1,'Prueba local',90,'ATP','2020-01-01','/afiche.png',true,'castellano','2D') returning id`, [slug])
  ).id;
  const p = await pelicula('resena-unica-local');
  const otra = await pelicula('resena-otra-local');
  const sala = (await q(`insert into public.cine_salas(nombre,filas,columnas) values('Reseña única local',20,28) returning id`)).id;
  const funcion = async (pelicula_id, dias) => (
    await q(`insert into public.cine_funciones(pelicula_id,sala_id,inicio,fin,precio)
      values($1,$2,now()-$3*interval '1 day',now()-$3*interval '1 day'+interval '2 hours',1000) returning id`, [pelicula_id, sala, dias])
  ).id;
  const f1 = await funcion(p, 20), f2 = await funcion(p, 21), fOtra = await funcion(otra, 22);
  const compra = async (usuario_id, funcion_id, usada = true, estado = 'confirmada') => {
    const r = await q(`insert into public.cine_reservas(usuario_id,funcion_id,solicitud,email,total,estado)
      values($1,$2,$3,'local@example.test',1000,$4) returning id,token`, [usuario_id, funcion_id, randomUUID(), estado]);
    await q(`insert into public.cine_entradas(reserva_id,funcion_id,butaca,usada_en)
      values($1,$2,$3,case when $4 then now()-interval '1 day' else null end)`, [r.id, funcion_id, 'A' + (++butaca), usada]);
    return r;
  };
  let butaca = 0;
  const a1 = await compra(cliente, f1), a2 = await compra(cliente, f2), a3 = await compra(cliente, f1);
  const b = await compra(admin, f1), c = await compra(empleado, f2), deOtra = await compra(cliente, fOtra);
  const sinIngreso = await compra(cliente, f2, false), invitada = await compra(null, f1);
  const cancelada = await compra(cliente, f2, true, 'cancelada'), pendiente = await compra(cliente, f1, false, 'pendiente');
  for (const [id, r, usuario, peli, valor, fecha] of [
    ['11111111-1111-4111-8111-111111111111', a1, cliente, p, 1, '2021-01-01'],
    ['22222222-2222-4222-8222-222222222222', a2, cliente, p, 1, '2022-01-01'],
    ['33333333-3333-4333-8333-333333333333', a3, cliente, p, 5, '2022-01-01'],
    [randomUUID(), b, admin, p, 1, '2023-01-01'],
    [randomUUID(), deOtra, cliente, otra, 4, '2023-01-01'],
  ]) {
    await q(`insert into public.cine_resenas(id,usuario_id,pelicula_id,reserva_id,nombre,calificacion,texto,creada)
      values($1,$2,$3,$4,'Autor local',$5,$6,$7)`, [id, usuario, peli, r.id, valor, 'Histórica ' + valor, fecha]);
  }
  const historia = async () => {
    await db.exec('reset role');
    return (await q(`select jsonb_build_object(
      'resenas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_resenas t),
      'compras',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_reservas t),
      'entradas',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_entradas t),
      'movimientos',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_movimientos t),
      'canjes',(select jsonb_agg(to_jsonb(t) order by id) from public.cine_canjes t)) d`)).d;
  };
  const originales = await historia();
  const antiguas = originales.resenas.length;
  if (variante) {
    // Emular el proyecto que aún no instaló 20261016000100: lector privado original.
    await db.exec(`create or replace function public.cine_mi_reserva(p_token uuid) returns jsonb
      language plpgsql stable security definer set search_path='' as $$
      begin
        if not public.cine_rol(array['cliente','empleado','administrador']) or not exists(
          select 1 from public.cine_reservas where token=p_token and usuario_id=auth.uid()) then
          raise exception 'Reserva no disponible para tu cuenta';end if;
        return public.cine_detalle_reserva(p_token);
      end $$;`);
  }
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261016000300_resena_unica_pelicula.sql'), 'utf8'));
  assert.deepEqual(await historia(), originales, 'Instalación conserva todas las reseñas originales e historia económica');
  const vigentes = async () => {
    await db.exec('reset role');
    return (await q(`select coalesce(jsonb_agg(to_jsonb(t) order by usuario_id,pelicula_id),'[]') d from public.cine_resenas_pelicula t`)).d;
  };
  const publicas = async (pelicula_id = p) => (await q('select public.cine_resenas_publicas($1) d', [pelicula_id])).d;
  const detalle = async (r) => (await q('select public.cine_mi_reserva($1) d', [r.token])).d;
  const guardar = (r, valor, texto) => q('select public.cine_escribir_resena($1,$2,$3)', [r.token, valor, texto]);
  const iniciales = await vigentes();
  const unica = iniciales.find(r => r.usuario_id === cliente && r.pelicula_id === p);
  assert.equal(unica.id, '33333333-3333-4333-8333-333333333333', 'Desempate histórico determinista por ID');
  assert.equal(unica.calificacion, 5);
  assert.equal(iniciales.filter(r => r.usuario_id === cliente && r.pelicula_id === p).length, 1);
  await identity(null, 'anon');
  assert.equal((await publicas()).promedio, 3, 'Una cuenta = un voto, no promedio por compra');
  assert.equal((await publicas()).resenas.length, 2);
  for (const r of (await publicas()).resenas) {
    assert.deepEqual(Object.keys(r).sort(), ['actualizada_en', 'calificacion', 'creada', 'id', 'nombre', 'texto']);
  }
  assert.deepEqual(await publicas(randomUUID()), { promedio: 0, resenas: [] });
  await assert.rejects(() => detalle(a1), /permission denied/);
  await assert.rejects(() => guardar(a1, 3, 'No autorizado'), /permission denied/);
  const portador = (await q('select public.cine_detalle_reserva($1) d', [a1.token])).d;
  assert.equal('texto_propio' in portador, false);
  assert.equal('resena_por_pelicula' in portador, false);
  for (const usuario of [cliente, admin, empleado]) {
    await identity(usuario);
    await assert.rejects(() => q('select * from public.cine_resenas_pelicula'), /permission denied/);
    await assert.rejects(() => q('delete from public.cine_resenas_pelicula'), /permission denied/);
  }
  await identity(cliente);
  for (const r of [a1, a2, a3, sinIngreso]) {
    const d = await detalle(r);
    assert.equal(d.calificacion_propia, 5);
    assert.equal(d.texto_propio, 'Histórica 5');
    assert.equal(d.resena_por_pelicula, true);
    assert.equal(d.token, r.token);
  }
  await guardar(a2, 3, '  Una sola opinión actualizada  ');
  const posteriores = await vigentes();
  assert.equal(posteriores.length, iniciales.length);
  assert.equal(posteriores.find(r => r.usuario_id === cliente && r.pelicula_id === p).id, unica.id);
  await identity(cliente);
  await guardar(a1, 3, 'Una sola opinión actualizada');
  assert.equal((await detalle(a3)).texto_propio, 'Una sola opinión actualizada');
  assert.equal((await publicas()).promedio, 2);
  const lista = (await q('select public.cine_mis_reservas() d')).d;
  const tokens = [a1, a2, a3, sinIngreso, cancelada, pendiente].map(r => r.token);
  const propias = lista.filter(r => tokens.includes(r.token));
  assert.equal(propias.length, tokens.length);
  assert.ok(propias.every(r => r.calificacion_propia === 3 && r.resena_por_pelicula === true));
  await guardar(deOtra, 2, 'Otra película, otra opinión');
  assert.equal((await detalle(a1)).calificacion_propia, 3);
  assert.equal((await detalle(deOtra)).calificacion_propia, 2);
  await identity(empleado);
  await guardar(c, 4, 'Mi primera reseña de esta película');
  await guardar(c, 4, 'Mi primera reseña de esta película');
  assert.equal((await publicas()).resenas.length, 3);
  assert.equal((await publicas()).promedio, 2.7);
  const estado = await vigentes();
  await identity(cliente);
  for (const r of [sinIngreso, invitada, cancelada, pendiente, b]) {
    await assert.rejects(() => guardar(r, 5, 'No debe guardarse'), /entrada utilizada/);
  }
  for (const [valor, texto] of [[0, 'Texto'], [6, 'Texto'], [null, 'Texto'], [3, null], [3, '  '], [3, 'x'.repeat(2001)]]) {
    await assert.rejects(() => guardar(a1, valor, texto), /inválida/);
  }
  await assert.rejects(() => detalle(b), /tu cuenta/);
  await db.exec('reset role');
  await q('update public.perfiles set activo=false where id=$1', [cliente]);
  await identity(cliente);
  await assert.rejects(() => guardar(a1, 4, 'No autorizado'), /Acceso denegado/);
  await assert.rejects(() => detalle(a1), /tu cuenta/);
  assert.deepEqual(await vigentes(), estado, 'Rechazos no modifican opiniones');
  assert.deepEqual(await historia(), originales, 'Ediciones actuales conservan íntegra la tabla histórica y compras');
  assert.equal((await historia()).resenas.length, antiguas);
  // Una RPC legada ya iniciada o una edición accidental no deben escribir en el archivo.
  await assert.rejects(() => q('update public.cine_resenas set calificacion=2 where reserva_id=$1', [a1.id]), /solo lectura/);
  await assert.rejects(() => q('delete from public.cine_resenas where reserva_id=$1', [a1.id]), /solo lectura/);
  await assert.rejects(() => q(`insert into public.cine_resenas(usuario_id,pelicula_id,reserva_id,nombre,calificacion,texto)
    values($1,$2,$3,'Legada',3,'Texto')`, [cliente, p, sinIngreso.id]), /solo lectura/);
  assert.deepEqual(await historia(), originales, 'El archivo queda protegido contra escritura legada');
  await assert.rejects(() => q(`insert into public.cine_resenas_pelicula(usuario_id,pelicula_id,reserva_id,nombre,calificacion,texto)
    values($1,$2,$3,'Duplicada',3,'Texto')`, [cliente, p, a1.id]), /duplicate key/);
  console.log('Reseña única: historial íntegro, selección histórica determinista, una cuenta/película, ediciones desde compras/funciones distintas, promedio sin votos duplicados, lectura propia/listado, permisos, elegibilidad y clave única: OK (SQL local; no concurrencia multiconexión)');
};
