const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const push = process.argv.includes('--push');
const resenaUnica = process.argv.includes('--resena-unica') || push;
const catalogo = process.argv.includes('--catalogo') || resenaUnica;
const experiencia = process.argv.includes('--experiencia') || catalogo;
const operativo = process.argv.includes('--operativo') || experiencia;
async function verificar(variante) {
  const db = new PGlite();
  const q = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const admin = randomUUID(),
    cliente = randomUUID(),
    empleado = randomUUID();
  const identity = async (id, role = 'authenticated') => {
    await db.exec(`reset role;set role ${role}`);
    await q("select set_config('test.uid',$1,false)", [id ?? '']);
  };
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('test.uid',true),''))::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
    );
    // Como verify:documento, no emula el servicio Supabase Storage.
    for (const name of [
      '20261006000100_esquema_inicial.sql',
      '20261007000100_operacion_cine.sql',
      '20261008000100_perfil_historial.sql',
      '20261008000200_checkout_beneficios.sql',
      '20261008000300_configuracion_cliente.sql',
      '20261009000100_alineacion_documento.sql',
    ])
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8'));
    if (variante) {
      await db.exec(`alter table public.generos rename column activa to activo;alter table public.eventos_auditoria rename column operacion to accion;
    create or replace function public.auditar_catalogo() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.eventos_auditoria(tabla,accion,registro_id,usuario_id) values(tg_table_name,tg_op,new.id,auth.uid());return null;end$$;`);
    }
    await db.exec(
      fs.readFileSync(
        path.join(__dirname, '../supabase/migrations/20261010000100_administracion_operativa.sql'),
        'utf8',
      ),
    );
    for (const [id, rol] of [
      [admin, 'administrador'],
      [cliente, 'cliente'],
      [empleado, 'empleado'],
    ]) {
      await q(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)`, [
        id,
        rol + '@example.com',
        {
          nombre: rol,
          apellido: 'Prueba',
          fecha_nacimiento: '1980-01-01',
          grupo_sanguineo: 'O+',
          color_ojos: 'Marrones',
          vacaciones_anuales: 14,
        },
      ]);
      await q(`update public.perfiles set rol=$1 where id=$2`, [rol, id]);
    }
    await identity(admin);
    if (
      operativo ||
      process.argv.includes('--integridad') ||
      process.argv.includes('--filtros') ||
      process.argv.includes('--puntos') ||
      process.argv.includes('--cierre')
    )
      await require('./verificar-integridad.cjs')({ db, q, identity, admin, cliente, empleado });
    if (
      operativo ||
      process.argv.includes('--filtros') ||
      process.argv.includes('--puntos') ||
      process.argv.includes('--cierre')
    )
      await require('./verificar-filtros.cjs')({ db, q, identity, admin });
    const genero = (
      await q(`select public.cine_guardar_genero($1) id`, [
        { nombre: 'Drama', slug: 'drama', activa: true },
      ])
    ).id;
    const datos = {
      titulo: 'Prueba admin',
      slug: 'prueba-admin',
      sinopsis: 'Prueba',
      poster_url: '/icons/icon-512x512.png',
      duracion_minutos: 60,
      clasificacion: 'ATP',
      fecha_estreno: '2020-01-01',
      idioma: 'castellano',
      formato: '4D',
      activa: true,
    };
    const pelicula = (await q(`select public.cine_guardar_pelicula($1,$2) id`, [datos, [genero]]))
      .id;
    const sala = (await q(`select public.cine_guardar_sala('Sala prueba',20,28) id`)).id;
    const create = async (n = 30) =>
      (
        await q(
          `select public.cine_crear_funcion($1,null,now()+$2*interval '1 day',1000,'castellano','4D') id`,
          [pelicula, n],
        )
      ).id;
    const funcion = await create();
    await q(
      `select public.cine_reprogramar_funcion($1,now()+interval '31 days','Cambio de horario')`,
      [funcion],
    );
    assert.equal(
      (await q(`select public.cine_disponibilidad($1) d`, [funcion])).d.funcion.formato,
      '4D',
    );
    const conflict = await create(32);
    await assert.rejects(
      () =>
        q(
          `select public.cine_reprogramar_funcion($1,(select inicio from public.cine_funciones where id=$2),'Conflicto de prueba')`,
          [funcion, conflict],
        ),
      /disponible/,
    );
    await q(`select public.cine_cancelar_funcion($1,'Cancelar función vacía')`, [conflict]);
    await q(`select public.cine_cancelar_funcion($1,'Reintento cancelación')`, [conflict]);
    await assert.rejects(
      () => q(`select public.cine_disponibilidad($1)`, [conflict]),
      /no disponible/,
    );
    const fecha = (await q(`select (current_date+40)::text d`)).d;
    const hasta = (await q(`select ($1::date+2)::text d`, [fecha])).d;
    const solicitud = randomUUID();
    const batchArgs = [
      pelicula,
      fecha,
      hasta,
      '20:00',
      [1, 2, 3, 4, 5, 6, 7],
      1000,
      'subtitulada',
      '3D',
      solicitud,
    ];
    const batch = async (args = batchArgs) =>
      (await q(`select public.cine_programar_funciones($1,$2,$3,$4,$5,$6,$7,$8,$9) d`, args)).d;
    const ids = await batch();
    assert.equal(ids.length, 3);
    assert.deepEqual(await batch(), ids);
    await assert.rejects(() => batch([...batchArgs.slice(0, 7), '5D', solicitud]), /Solicitud/);
    assert.equal(
      (
        await q(
          `select extract(hour from inicio at time zone 'UTC')::int h from public.cine_funciones where id=$1`,
          [ids[0]],
        )
      ).h,
      23,
    );
    const totalAntes = (await q(`select count(*)::int n from public.cine_funciones`)).n;
    const antes = (await q(`select ($1::date-1)::text d`, [fecha])).d;
    await assert.rejects(
      () =>
        batch([
          pelicula,
          antes,
          fecha,
          '20:00',
          [1, 2, 3, 4, 5, 6, 7],
          1000,
          'castellano',
          '4D',
          randomUUID(),
        ]),
      /disponible/,
    );
    assert.equal(
      (await q(`select count(*)::int n from public.cine_funciones`)).n,
      totalAntes,
      'Rollback del lote si una fecha falla',
    );
    await assert.rejects(
      () =>
        batch([
          pelicula,
          fecha,
          '2099-01-01',
          '20:00',
          [1],
          1000,
          'castellano',
          '4D',
          randomUUID(),
        ]),
      /90 días/,
    );
    const producto = (
      await q(`select public.cine_guardar_oferta('producto',$1) id`, [
        { nombre: 'Pochoclos', precio: 200, stock: 10, activo: true },
      ])
    ).id;
    const buy = async (f, usuario, seat) => {
      await identity(usuario, usuario ? 'authenticated' : 'anon');
      const candy = [{ tipo: 'producto', id: producto, cantidad: 2 }];
      const cotizacion = (
        await q(`select public.cine_cotizar($1,$2,$3,'',0) d`, [f, [seat], candy])
      ).d;
      await identity(null, 'service_role');
      return (
        await q(`select public.cine_comprar_documento($1,$2,$3,$4) token`, [
          usuario,
          {
            funcion: f,
            butacas: [seat],
            candy,
            cupon: '',
            credito: 0,
            email: 'compra@example.com',
            nombre: 'Prueba',
            edad: true,
            solicitud: randomUUID(),
            cotizacion,
          },
          randomUUID(),
          'x'.repeat(30),
        ])
      ).token;
    };
    const token = await buy(funcion, cliente, 'A1');
    await identity(admin);
    await assert.rejects(
      () =>
        q(
          `select public.cine_reprogramar_funcion($1,now()+interval '33 days','Cambio con compras')`,
          [funcion],
        ),
      /compras/,
    );
    const report = async () =>
      (
        await q(
          `select public.cine_reportes_admin(now()-interval '1 day',now()+interval '1 day') d`,
        )
      ).d;
    let r = await report();
    assert.equal(r.total, 1400);
    assert.equal(r.entradas, 1);
    assert.equal(r.candy[0].cantidad, 2);
    assert.equal(r.peliculas[0].vistas, 0);
    await q(`select public.cine_cancelar_funcion($1,'Cancelación operativa')`, [funcion]);
    await q(`select public.cine_cancelar_funcion($1,'Reintento sin duplicar')`, [funcion]);
    await identity(cliente);
    const saldos = (await q(`select public.cine_mis_beneficios() d`)).d;
    assert.equal(saldos.credito, 1400);
    assert.equal(saldos.puntos, 0);
    await identity(admin);
    r = await report();
    assert.equal(r.total, 0);
    assert.equal(r.entradas, 0);
    assert.deepEqual(r.candy, []);
    await db.exec('reset role');
    assert.equal(
      (await q(`select stock from public.cine_productos where id=$1`, [producto])).stock,
      10,
    );
    assert.equal(
      (await q(`select estado from public.cine_reservas where token=$1`, [token])).estado,
      'cancelada',
    );
    await identity(admin);
    const guestF = await create(35);
    await buy(guestF, cliente, 'A1');
    await buy(guestF, null, 'A2');
    await identity(admin);
    await assert.rejects(
      () => q(`select public.cine_cancelar_funcion($1,'Cancelar con invitado')`, [guestF]),
      /invitadas/,
    );
    await db.exec('reset role');
    assert.equal(
      (
        await q(
          `select count(*)::int n from public.cine_reservas where funcion_id=$1 and estado='confirmada'`,
          [guestF],
        )
      ).n,
      2,
    );
    await identity(admin);
    const usadaF = await create(36);
    const usadaToken = await buy(usadaF, cliente, 'B1');
    await db.exec('reset role');
    await q(
      `update public.cine_entradas set usada_en=now() where reserva_id=(select id from public.cine_reservas where token=$1)`,
      [usadaToken],
    );
    await identity(admin);
    assert.equal((await report()).peliculas[0].vistas, 1);
    await assert.rejects(
      () => q(`select public.cine_cancelar_funcion($1,'Cancelar con ingreso usado')`, [usadaF]),
      /utilizadas/,
    );
    await assert.rejects(
      () => q(`select public.cine_reportes_admin(now(),now()-interval '1 day')`),
      /período/,
    );
    await assert.rejects(
      () => q(`select public.cine_consultar_auditoria(now(),now()-interval '1 day')`),
      /posterior/,
    );
    await assert.rejects(() => q(`select * from public.cine_programaciones`), /permission denied/);
    // Mantener asociaciones históricas inactivas, pero impedir nuevas.
    await identity(admin);
    await q(`select public.cine_guardar_genero($1)`, [
      { id: genero, nombre: 'Drama', slug: 'drama', activa: false },
    ]);
    await q(`select public.cine_guardar_pelicula($1,$2)`, [
      { ...datos, id: pelicula, titulo: 'Editada' },
      [genero],
    ]);
    await assert.rejects(
      () => q(`select public.cine_guardar_pelicula($1,$2)`, [{ ...datos, slug: 'otra' }, [genero]]),
      /activos/,
    );
    const users = (await q(`select public.cine_usuarios_admin('cliente@example.com',0) d`)).d;
    assert.equal(users.length, 1);
    assert.equal(users[0].id, cliente);
    assert.equal('fecha_nacimiento' in users[0], false);
    await assert.rejects(
      () => q(`select public.cine_administrar_usuario($1,'cliente',true)`, [admin]),
      /propio/,
    );
    await q(`select public.cine_administrar_usuario($1,'empleado',false)`, [cliente]);
    const audit = (
      await q(
        `select public.cine_consultar_auditoria(now()-interval '1 day',now()+interval '1 day') d`,
      )
    ).d;
    assert.ok(audit.some((a) => a.tabla === 'generos'));
    assert.ok(audit.some((a) => a.tabla === 'peliculas'));
    assert.ok(audit.some((a) => a.operacion === 'CAMBIAR_ACCESO'));
    assert.equal(new Set(audit.map((a) => a.id)).size, audit.length);
    assert.ok(audit.every((a) => !('registro' in a) && !('datos_nuevos' in a)));
    for (const [id, role] of [
      [cliente, 'authenticated'],
      [empleado, 'authenticated'],
      [null, 'anon'],
    ]) {
      await identity(id, role);
      for (const [sql, args] of [
        [`select public.cine_reportes_admin(now()-interval '1 day',now())`, []],
        [`select public.cine_usuarios_admin('',0)`, []],
        [`select public.cine_cancelar_funcion($1,'Prueba de permisos')`, [guestF]],
        [`select public.cine_administrar_usuario($1,'administrador',true)`, [id ?? empleado]],
        [
          `select public.cine_reprogramar_funcion($1,now()+interval '80 days','Prueba de permisos')`,
          [guestF],
        ],
        [`select public.cine_programar_funciones($1,$2,$3,$4,$5,$6,$7,$8,$9)`, batchArgs],
      ])
        await assert.rejects(() => q(sql, args), /denegado|permission denied/);
    }
    await identity(admin);
    await assert.rejects(
      () => q(`select public.administrar_perfil($1,'cliente',true)`, [empleado]),
      /permission denied/,
    );
    console.log(
      `Administración (${variante ? 'activo/accion remoto' : 'activa/operacion inicial'}): permisos, auditoría unificada, asociaciones históricas, roles, programación atómica/idempotente, cancelación/crédito/stock, reportes: OK`,
    );
    if (operativo || process.argv.includes('--puntos') || process.argv.includes('--cierre'))
      await require('./verificar-puntos.cjs')({ db, q, identity, admin });
    if (operativo || process.argv.includes('--cierre'))
      await require('./verificar-cierre.cjs')({ db, q, identity, admin, cliente, empleado });
    if (operativo)
      await require('./verificar-operativo.cjs')({ db, q, identity, admin, cliente, empleado });
    if (experiencia)
      await require('./verificar-experiencia.cjs')({ db, q, identity, admin, empleado });
    if (catalogo)
      await require('./verificar-catalogo.cjs')({ db, q, identity, admin, cliente, empleado });
    if (resenaUnica)
      await require('./verificar-resena-unica.cjs')({
        db,
        q,
        identity,
        admin,
        cliente,
        empleado,
        variante,
      });
    if (push)
      await require('./verificar-web-push.cjs')({ db, q, identity, admin, cliente, empleado });
  } finally {
    await db.close();
  }
}
(async () => {
  await verificar(false);
  await verificar(true);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
