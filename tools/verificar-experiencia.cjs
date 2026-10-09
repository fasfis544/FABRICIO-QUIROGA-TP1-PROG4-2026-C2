const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
module.exports = async ({ db, q, identity, admin, empleado }) => {
  await db.exec('reset role');
  const compra = await q(`select r.id,r.token,r.usuario_id,f.pelicula_id from public.cine_reservas r
    join public.cine_funciones f on f.id=r.funcion_id where r.estado='confirmada' and r.usuario_id is not null
    and exists(select 1 from public.cine_entradas e where e.reserva_id=r.id and e.usada_en is not null) limit 1`);
  assert.ok(compra, 'El verificador previo deja una compra usada para esta regresión local');
  await q('update public.perfiles set activo=true where id=$1', [compra.usuario_id]);
  await q(
    `insert into public.cine_resenas(usuario_id,pelicula_id,reserva_id,nombre,calificacion,texto)
    values($1,$2,$3,'Experiencia local',3,'Comentario original local') on conflict(usuario_id,reserva_id)
    do update set calificacion=3,texto='Comentario original local'`,
    [compra.usuario_id, compra.pelicula_id, compra.id],
  );
  const snapshot = async () =>
    (
      await q(`select jsonb_build_object(
    'compras',(select jsonb_agg(to_jsonb(r) order by id) from public.cine_reservas r),
    'resenas',(select jsonb_agg(to_jsonb(r) order by id) from public.cine_resenas r),
    'movimientos',(select jsonb_agg(to_jsonb(r) order by id) from public.cine_movimientos r),
    'notificaciones',(select jsonb_agg(to_jsonb(r) order by id) from public.cine_notificaciones r)) d`)
    ).d;
  const antes = await snapshot();
  await db.exec(
    fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20261016000100_resena_propia.sql'),
      'utf8',
    ),
  );
  assert.deepEqual(
    await snapshot(),
    antes,
    'El bloque de lectura conserva reseñas, documentos, movimientos y avisos',
  );
  await identity(compra.usuario_id);
  const detalle = (await q('select public.cine_mi_reserva($1) d', [compra.token])).d;
  assert.equal(detalle.texto_propio, 'Comentario original local');
  assert.equal(detalle.calificacion_propia, 3);
  assert.equal(detalle.token, compra.token);
  await q('select public.cine_escribir_resena($1,4,$2)', [
    compra.token,
    'Comentario actualizado local',
  ]);
  assert.equal(
    (await q('select public.cine_mi_reserva($1) d', [compra.token])).d.texto_propio,
    'Comentario actualizado local',
  );
  for (const id of [admin, empleado].filter((id) => id !== compra.usuario_id)) {
    await identity(id);
    await assert.rejects(() => q('select public.cine_mi_reserva($1)', [compra.token]), /tu cuenta/);
  }
  await identity(null, 'anon');
  await assert.rejects(
    () => q('select public.cine_mi_reserva($1)', [compra.token]),
    /permission denied/,
  );
  const portador = (await q('select public.cine_detalle_reserva($1) d', [compra.token])).d;
  assert.equal('texto_propio' in portador, false, 'No se amplía el contrato portador de invitados');
  await db.exec('reset role');
  await q('update public.perfiles set activo=false where id=$1', [compra.usuario_id]);
  await identity(compra.usuario_id);
  await assert.rejects(() => q('select public.cine_mi_reserva($1)', [compra.token]), /tu cuenta/);

  const templates = ['confirmacion', 'recuperacion', 'cambio-email', 'invitacion', 'enlace-magico'];
  for (const nombre of templates) {
    const html = fs.readFileSync(
      path.join(__dirname, '../supabase/templates/auth', nombre + '.html'),
      'utf8',
    );
    assert.match(html, /<html lang="es">/);
    assert.match(html, /CINE AURORA/);
    assert.match(html, /#09090b/);
    assert.match(html, /#141416/);
    assert.match(html, /#e4e4e7/);
    assert.equal((html.match(/href="{{ \.ConfirmationURL }}"/g) ?? []).length, 2);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<script|<iframe|localhost|service_role|sb_secret_/i);
    assert.equal(
      (html.match(/{{.*?}}/g) ?? []).every((variable) => variable === '{{ .ConfirmationURL }}'),
      true,
    );
  }
  console.log(
    'Experiencia: reseña propia/roles/perfil inactivo/portador/historia y 5 plantillas Auth: OK (solo local)',
  );
};
