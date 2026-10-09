// PostgreSQL local en memoria. No conecta al proyecto remoto.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  const columnasExistentes = process.argv.includes('--columnas-existentes');
  const checks = [];
  const q = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const ids = {
    admin: randomUUID(),
    empleado: randomUUID(),
    cliente: randomUUID(),
    otro: randomUUID(),
  };
  const identidad = async (tipo) => {
    await db.exec(`reset role;set role ${tipo === 'anon' ? 'anon' : 'authenticated'};`);
    await q(`select set_config('test.uid',$1,false)`, [ids[tipo] ?? '']);
  };
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');grant usage on schema auth to anon,authenticated;`,
    );
    for (const name of [
      '20261006000100_esquema_inicial.sql',
      '20261007000100_operacion_cine.sql',
      '20261008000100_perfil_historial.sql',
      '20261008000200_checkout_beneficios.sql',
      '20261008000300_configuracion_cliente.sql',
    ]) {
      if (columnasExistentes && name === '20261008000200_checkout_beneficios.sql') {
        await db.exec(`
          alter table public.peliculas add column idioma text not null default 'Inglés';
          alter table public.peliculas add column formato text not null default '3D';
          alter table public.cine_funciones add column idioma text not null default 'Inglés';
          alter table public.cine_funciones add column formato text not null default '3D';
          insert into public.peliculas(titulo,slug,duracion_minutos,clasificacion,fecha_estreno)
          values('Catálogo existente','catalogo-existente',90,'ATP','2020-01-01');
        `);
      }
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8'));
    }
    if (columnasExistentes) {
      const previa = await q(`select idioma,formato from public.peliculas where slug='catalogo-existente'`);
      assert.deepEqual(previa, { idioma: 'Inglés', formato: '3D' });
      const definiciones = (await db.query(`select column_name,column_default from information_schema.columns
        where table_schema='public' and table_name in ('peliculas','cine_funciones')
        and column_name in ('idioma','formato')`)).rows;
      assert.equal(definiciones.length, 4);
      for (const d of definiciones) assert.ok(d.column_default.includes(d.column_name === 'idioma' ? 'Inglés' : '3D'));
      checks.push('Idioma/formato preexistentes: definición, valores y defaults conservados');
    }
    for (const id of Object.values(ids)) await q(`insert into auth.users(id) values($1)`, [id]);
    await q(`update public.perfiles set rol='administrador' where id=$1`, [ids.admin]);
    await q(`update public.perfiles set rol='empleado' where id=$1`, [ids.empleado]);
    await identidad('admin');
    const pelicula = (
      await q(`select public.cine_guardar_pelicula($1,'{}') id`, [
        JSON.stringify({
          titulo: 'Prueba',
          slug: 'prueba',
          duracion_minutos: 90,
          clasificacion: '18',
          fecha_estreno: '2020-01-01',
        }),
      ])
    ).id;
    const sala = (await q(`select public.cine_guardar_sala('Sala',3,10) id`)).id;
    const futura = (
      await q(`select public.cine_crear_funcion($1,$2,now()+interval '4 hours',1000) id`, [
        pelicula,
        sala,
      ])
    ).id;
    const cercana = (
      await q(`select public.cine_crear_funcion($1,$2,now()+interval '20 minutes',1000) id`, [
        pelicula,
        sala,
      ])
    ).id;
    const oferta = async (tipo, datos) =>
      (await q(`select public.cine_guardar_oferta($1,$2) id`, [tipo, JSON.stringify(datos)])).id;
    const producto = await oferta('producto', {
      nombre: 'Pochoclos',
      precio: 200,
      stock: 10,
      activo: true,
    });
    const combo = await oferta('combo', {
      nombre: 'Combo',
      precio: 300,
      activo: true,
      items: [{ producto_id: producto, cantidad: 2 }],
    });
    const fechas = {
      desde: new Date(Date.now() - 3600000).toISOString(),
      hasta: new Date(Date.now() + 86400000).toISOString(),
    };
    await oferta('cupon', {
      codigo: 'PROMO',
      porcentaje: 10,
      minimo: 0,
      limite: 1,
      solo_registrados: false,
      activo: true,
      ...fechas,
    });
    const recompensa = await oferta('recompensa', {
      nombre: 'Descuento',
      puntos: 100,
      porcentaje: 20,
      activa: true,
      ...fechas,
    });
    checks.push('Catálogos administrables por RPC sin datos ficticios');
    const reservar = async ({
      funcion = futura,
      butacas = ['A1'],
      candy = [],
      cupon = '',
      credito = 0,
      edad = true,
      solicitud = randomUUID(),
    } = {}) =>
      (
        await q(
          `select public.cine_checkout($1,$2,$3,$4,$5,'prueba@example.com','Cliente Prueba',$6,$7) token`,
          [funcion, butacas, JSON.stringify(candy), cupon, credito, edad, solicitud],
        )
      ).token;
    const detalle = async (token) => (await q(`select public.cine_comprobante($1) r`, [token])).r;
    const beneficios = async () => (await q(`select public.cine_mis_beneficios() r`)).r;
    await identidad('cliente');
    await q(`select public.cine_editar_mi_perfil('Ana','Cine')`);
    await assert.rejects(
      () => oferta('producto', { nombre: 'Intruso', precio: 1, stock: 1, activo: true }),
      /denegado/,
    );
    assert.equal((await q('select nombre from public.perfiles where id=auth.uid()')).nombre, 'Ana');
    await assert.rejects(
      () => q(`update public.perfiles set rol='administrador' where id=auth.uid()`),
      /permission denied/,
    );
    await assert.rejects(() => q(`select public.cine_saldos($1)`, [ids.otro]), /permission denied/);
    await assert.rejects(() => q(`select * from public.cine_movimientos`), /permission denied/);
    await assert.rejects(() => reservar({ edad: false }), /edad/);
    await assert.rejects(() => reservar({ butacas: ['A1', 'A3'] }), /contiguas/);
    const solicitud = randomUUID();
    const candy = [{ tipo: 'combo', id: combo, cantidad: 1 }];
    const token = await reservar({ candy, cupon: 'PROMO', solicitud });
    assert.equal(await reservar({ candy, cupon: 'PROMO', solicitud }), token);
    assert.equal((await detalle(token)).total, 1170);
    await assert.rejects(() => reservar({ butacas: ['A2'], cupon: 'PROMO' }), /agotado/);
    await assert.rejects(
      () => reservar({ butacas: ['A2'], candy: [{ tipo: 'producto', id: producto, cantidad: 9 }] }),
      /Stock insuficiente/,
    );
    await assert.rejects(
      () =>
        q(
          `select public.cine_checkout($1,array['A2'],'[]','',0,'prueba@example.com','Cliente',true,gen_random_uuid(),1)`,
          [futura],
        ),
      /precio cambió/,
    );
    await identidad('otro');
    await assert.rejects(() => q(`select public.cine_mi_reserva($1)`, [token]), /cuenta/);
    await assert.rejects(() => reservar({ candy, cupon: 'PROMO', solicitud }), /utilizada/);
    assert.equal((await q(`select public.cine_mis_reservas() r`)).r.length, 0);
    await identidad('cliente');
    assert.equal((await q(`select public.cine_mis_reservas() r`)).r.length, 1);
    await assert.rejects(() => q(`select public.cine_confirmar_reserva($1)`, [token]), /denegado/);
    checks.push(
      'Perfil sin cambios de rol; RLS, historial por propietario, edad, contigüidad, cuota de cupón, stock retenido e idempotencia',
    );
    await identidad('empleado');
    await q(`select public.cine_confirmar_reserva($1)`, [token]);
    await q(`select public.cine_confirmar_reserva($1)`, [token]);
    await identidad('cliente');
    assert.equal((await beneficios()).puntos, 1170);
    assert.equal((await beneficios()).puntos_disponibles, 0);
    await assert.rejects(
      () => q(`select public.cine_canjear($1,gen_random_uuid())`, [recompensa]),
      /insuficientes/,
    );
    await q(`select public.cine_cancelar($1)`, [token]);
    await q(`select public.cine_cancelar($1)`, [token]);
    assert.equal((await beneficios()).credito, 1170);
    assert.equal((await beneficios()).puntos, 0);
    await db.exec('reset role');
    assert.equal(
      (await q(`select stock from public.cine_productos where id=$1`, [producto])).stock,
      10,
    );
    await identidad('cliente');
    const token2 = await reservar({ butacas: ['A1'], credito: 1000 });
    assert.equal((await beneficios()).credito_disponible, 170);
    await assert.rejects(() => reservar({ butacas: ['A2'], credito: 171 }), /insuficiente/);
    await identidad('empleado');
    await q(`select public.cine_confirmar_reserva($1)`, [token2]);
    await identidad('cliente');
    assert.equal((await beneficios()).credito, 170);
    assert.equal((await beneficios()).puntos, 0);
    checks.push(
      'Confirmación y cancelación idempotentes, stock repuesto, butaca liberada, crédito retenido y puntos solo por efectivo',
    );
    const token3 = await reservar({
      funcion: cercana,
      butacas: ['B1'],
      candy: [{ tipo: 'producto', id: producto, cantidad: 1 }],
    });
    await identidad('empleado');
    await q(`select public.cine_confirmar_reserva($1)`, [token3]);
    const recibo = await detalle(token3);
    const validar = async (codigo, tipo) =>
      (await q(`select public.cine_validar_prestacion($1,$2) r`, [codigo, tipo])).r;
    assert.equal((await validar(recibo.entradas[0].codigo, 'entrada')).ok, true);
    assert.equal((await validar(recibo.entradas[0].codigo, 'entrada')).ok, false);
    assert.equal((await validar(recibo.candy_codigo, 'candy')).ok, true);
    assert.equal((await validar(recibo.candy_codigo, 'candy')).ok, false);
    await identidad('cliente');
    await assert.rejects(() => q(`select public.cine_cancelar($1)`, [token3]), /dos horas/);
    await q(`select public.cine_escribir_resena($1,5,'Gran película')`, [token3]);
    await q(`select public.cine_escribir_resena($1,4,'Actualización')`, [token3]);
    assert.equal(
      (await q(`select public.cine_resenas_publicas($1) r`, [pelicula])).r.resenas.length,
      1,
    );
    await assert.rejects(
      () => q(`select public.cine_escribir_resena($1,5,'No la vi')`, [token2]),
      /utilizada/,
    );
    const canjeSolicitud = randomUUID();
    await q(`select public.cine_canjear($1,$2)`, [recompensa, canjeSolicitud]);
    await q(`select public.cine_canjear($1,$2)`, [recompensa, canjeSolicitud]);
    assert.equal((await beneficios()).canjes.length, 1);
    assert.equal((await beneficios()).puntos, 1100);
    // Una falla de stock después de reservar revierte toda la confirmación.
    await identidad('admin');
    const otroProducto = await oferta('producto', {
      nombre: 'Bebida',
      precio: 100,
      stock: 10,
      activo: true,
    });
    await identidad('cliente');
    const fallida = await reservar({
      butacas: ['C2'],
      credito: 100,
      candy: [
        { tipo: 'producto', id: producto, cantidad: 1 },
        { tipo: 'producto', id: otroProducto, cantidad: 1 },
      ],
    });
    await db.exec('reset role');
    await q(`update public.cine_productos set stock=0 where id=$1`, [otroProducto]);
    const stockAntes = (await q(`select stock from public.cine_productos where id=$1`, [producto]))
      .stock;
    await identidad('empleado');
    await assert.rejects(
      () => q(`select public.cine_confirmar_reserva($1)`, [fallida]),
      /Stock insuficiente/,
    );
    await db.exec('reset role');
    assert.equal(
      (await q(`select stock from public.cine_productos where id=$1`, [producto])).stock,
      stockAntes,
    );
    await identidad('cliente');
    assert.equal((await detalle(fallida)).estado, 'pendiente');
    assert.equal((await beneficios()).credito, 170);
    await q(`select public.cine_cancelar($1)`, [fallida]);
    checks.push(
      'Total obsoleto rechazado y confirmación fallida sin consumo parcial de stock/crédito/puntos',
    );
    checks.push(
      'Ingreso/candy independientes, rechazos auditados, límite de cancelación, reseñas solo tras ingreso y canjes idempotentes',
    );
    await q(`select public.cine_alerta($1,true)`, [pelicula]);
    await identidad('admin');
    await q(`select public.cine_crear_funcion($1,$2,now()+interval '1 day',1000)`, [
      pelicula,
      sala,
    ]);
    await identidad('cliente');
    assert.ok((await beneficios()).notificaciones.some((n) => n.mensaje.includes('Nueva función')));
    const n = (await beneficios()).notificaciones[0];
    await q(`select public.cine_marcar_leida($1)`, [n.id]);
    await identidad('otro');
    await assert.rejects(() => q(`select public.cine_marcar_leida($1)`, [n.id]), /disponible/);
    await identidad('anon');
    await assert.rejects(() => q(`select public.cine_mis_beneficios()`), /permission denied/);
    const invitado = await reservar({ butacas: ['C1'] });
    await db.exec('reset role');
    await q(`update public.cine_reservas set vence=now()-interval '1 minute' where token=$1`, [
      invitado,
    ]);
    await identidad('anon');
    await reservar({ butacas: ['C1'] });
    assert.equal((await detalle(invitado)).entradas.length, 1);
    assert.equal((await detalle(invitado)).estado, 'vencida');
    checks.push(
      'Alertas internas, notificaciones privadas, invitados sin beneficios y conservación de entradas vencidas',
    );
    console.log(checks.join('\n'));
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
