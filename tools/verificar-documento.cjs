// PostgreSQL local: prueba la migración nueva SIN conexión remota.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  const q = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const admin = randomUUID(),
    cliente = randomUUID(),
    menor = randomUUID(),
    empleado = randomUUID();
  const identity = async (id, role = 'authenticated') => {
    await db.exec(`reset role; set role ${role};`);
    await q(`select set_config('test.uid',$1,false)`, [id ?? '']);
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('test.uid',true),''))::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role;`);
    for (const name of [
      '20261006000100_esquema_inicial.sql',
      '20261007000100_operacion_cine.sql',
      '20261008000100_perfil_historial.sql',
      '20261008000200_checkout_beneficios.sql',
      '20261008000300_configuracion_cliente.sql',
      '20261009000100_alineacion_documento.sql',
    ])
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8'));
    const profile = (date) =>
      JSON.stringify({
        nombre: 'Ana',
        apellido: 'Cine',
        fecha_nacimiento: date,
        grupo_sanguineo: 'O+',
        color_ojos: 'Marrones',
        vacaciones_anuales: 14,
      });
    for (const [id, date] of [
      [admin, '1980-01-01'],
      [cliente, '1990-01-01'],
      [menor, '2020-01-01'],
      [empleado, '1980-01-01'],
    ])
      await q(`insert into auth.users(id,raw_user_meta_data) values($1,$2)`, [id, profile(date)]);
    await q(`update public.perfiles set rol='administrador' where id=$1`, [admin]);
    await q(`update public.perfiles set rol='empleado' where id=$1`, [empleado]);
    // All active roles edit only their own personal data; payload cannot escalate access.
    for (const [id, rol] of [
      [admin, 'administrador'],
      [empleado, 'empleado'],
      [cliente, 'cliente'],
    ]) {
      await identity(id);
      await q(`select public.cine_completar_perfil($1)`, [
        {
          ...JSON.parse(profile('1990-01-01')),
          nombre: 'Perfil actualizado',
          id: menor,
          rol: 'administrador',
          activo: false,
          puntos: 9999,
          credito: 9999,
        },
      ]);
      const propio = await q(`select nombre,rol,activo from public.perfiles where id=auth.uid()`);
      assert.equal(propio.nombre, 'Perfil actualizado');
      assert.equal(propio.rol, rol);
      assert.equal(propio.activo, true);
      await assert.rejects(
        () => q(`select public.cine_completar_perfil($1)`, [JSON.parse(profile('2999-01-01'))]),
        /futura/,
      );
    }
    await identity(null, 'anon');
    await assert.rejects(() =>
      q(`select public.cine_completar_perfil($1)`, [JSON.parse(profile('1990-01-01'))]),
    );
    await db.exec('reset role');
    assert.equal(
      (await q(`select nombre from public.perfiles where id=$1`, [menor])).nombre,
      'Ana',
    );
    await q(`update public.perfiles set activo=false where id=$1`, [empleado]);
    await identity(empleado);
    await assert.rejects(
      () => q(`select public.cine_completar_perfil($1)`, [JSON.parse(profile('1990-01-01'))]),
      /denegado/,
    );
    await db.exec('reset role');
    await q(`update public.perfiles set activo=true where id=$1`, [empleado]);
    const genero = (
      await q(`insert into public.generos(nombre,slug) values('Drama','drama') returning id`)
    ).id;
    await identity(admin);
    const peliculaDatos = {
      titulo: 'Prueba',
      slug: 'prueba',
      sinopsis: 'Prueba del documento',
      poster_url: '/images/prueba.png',
      duracion_minutos: 90,
      clasificacion: '18',
      fecha_estreno: '2020-01-01',
      idioma: 'castellano',
      formato: '2D',
    };
    await assert.rejects(
      () => q(`select public.cine_guardar_pelicula($1,'{}')`, [peliculaDatos]),
      /género/,
    );
    const pelicula = (
      await q(`select public.cine_guardar_pelicula($1,$2) id`, [peliculaDatos, [genero]])
    ).id;
    const sala = (await q(`select public.cine_guardar_sala('Sala Documento',20,28) id`)).id;
    const funcion = (
      await q(
        `select public.cine_crear_funcion($1,null,now()+interval '20 minutes',1000,'castellano','2D') id`,
        [pelicula],
      )
    ).id;
    const futura = (
      await q(
        `select public.cine_crear_funcion($1,null,now()+interval '4 hours',1000,'subtitulada','3D') id`,
        [pelicula],
      )
    ).id;
    await assert.rejects(
      () =>
        q(
          `select public.cine_crear_funcion($1,null,now()+interval '4 hours',1000,'castellano','2D')`,
          [pelicula],
        ),
      /disponible/,
    );
    const mapa = (await q(`select public.cine_disponibilidad($1) d`, [futura])).d;
    assert.equal(mapa.butacas.length, 532);
    assert.equal(mapa.butacas.filter((b) => b.tipo === 'accesible').length, 28);
    assert.equal(mapa.butacas.filter((b) => b.tipo === 'vip').length, 84);
    assert.equal(mapa.butacas.find((b) => b.codigo === 'R1').precio, 1250);
    assert.equal(
      mapa.butacas.some((b) => b.codigo === 'J15'),
      false,
    );
    const oferta = async (tipo, datos) =>
      (await q(`select public.cine_guardar_oferta($1,$2) id`, [tipo, datos])).id;
    const producto = await oferta('producto', {
      nombre: 'Pochoclos',
      precio: 200,
      stock: 5,
      categoria: 'Snacks',
      activo: true,
    });
    const dates = {
      desde: new Date(Date.now() - 3600000).toISOString(),
      hasta: new Date(Date.now() + 86400000).toISOString(),
    };
    await oferta('cupon', {
      codigo: 'FIJO',
      tipo: 'monto',
      monto: 150,
      porcentaje: null,
      minimo: 0,
      limite: null,
      solo_registrados: false,
      activo: true,
      ...dates,
    });
    await oferta('cupon', {
      codigo: 'MAYORES',
      tipo: 'porcentaje',
      porcentaje: 10,
      edad_minima: 50,
      minimo: 0,
      limite: 10,
      solo_registrados: true,
      activo: true,
      ...dates,
    });
    const recompensa = await oferta('recompensa', {
      nombre: 'Pochoclos gratis',
      puntos: 50,
      tipo: 'producto',
      producto_id: producto,
      activa: true,
      ...dates,
    });
    const entradaGratis = await oferta('recompensa', {
      nombre: 'Entrada gratis',
      puntos: 100,
      tipo: 'entrada',
      activa: true,
      ...dates,
    });
    const combo = await oferta('combo', {
      nombre: 'Entrada y pochoclos',
      precio: 900,
      activo: true,
      incluye_entrada: true,
      items: [{ producto_id: producto, cantidad: 1 }],
    });
    await identity(cliente);
    const quote = async (f = futura, bs = ['A1'], candy = [], cupon = '', credito = 0) =>
      (await q(`select public.cine_cotizar($1,$2,$3,$4,$5) d`, [f, bs, candy, cupon, credito])).d;
    await assert.rejects(() => quote(futura, ['J15']), /inexistente/);
    await assert.rejects(() => quote(futura, ['A4', 'A5']), /pasillo/);
    await assert.rejects(() => quote(futura, ['A1', 'A3']), /contiguas/);
    assert.equal((await quote(futura, ['R1'])).total, 1250);
    assert.equal(
      (await quote(futura, ['A1'], [{ tipo: 'combo', id: combo, cantidad: 1 }])).total,
      900,
    );
    assert.equal(
      (await quote(futura, ['R1'], [{ tipo: 'combo', id: combo, cantidad: 1 }])).total,
      1150,
    );
    await assert.rejects(
      () => quote(futura, ['A1'], [{ tipo: 'combo', id: combo, cantidad: 2 }]),
      /más entradas/,
    );
    assert.equal((await quote(futura, ['A1'], [], 'FIJO')).total, 850);
    await assert.rejects(() => quote(futura, ['A1'], [], 'MAYORES'), /condiciones/);
    const bienvenida = (await q(`select public.cine_mis_beneficios() d`)).d.cupones.find((c) =>
      c.codigo.startsWith('BIENVENIDA'),
    );
    assert.equal((await quote(futura, ['A1'], [], bienvenida.codigo)).total, 800);
    await identity(menor);
    await assert.rejects(() => quote(), /edad mínima/);
    await identity(cliente);
    const candy = [{ tipo: 'producto', id: producto, cantidad: 1 }];
    const c = await quote(funcion, ['A1', 'A2'], candy);
    const request = {
      funcion,
      butacas: ['A1', 'A2'],
      candy,
      cupon: '',
      credito: 0,
      email: 'prueba@example.com',
      nombre: 'Ana Cine',
      edad: false,
      solicitud: randomUUID(),
      cotizacion: c,
    };
    await assert.rejects(
      () =>
        q(`select public.cine_comprar_documento($1,$2,$3,$4)`, [
          cliente,
          request,
          randomUUID(),
          'x'.repeat(30),
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        q(
          `select public.cine_checkout($1,array['A1'],'[]','',0,'prueba@example.com','Ana',true,gen_random_uuid(),1000)`,
          [futura],
        ),
      /permission denied/,
    );
    await identity(null, 'service_role');
    const codigo = randomUUID();
    const token = (
      await q(`select public.cine_comprar_documento($1,$2,$3,$4) token`, [
        cliente,
        request,
        codigo,
        'x'.repeat(30),
      ])
    ).token;
    assert.equal(
      (
        await q(`select public.cine_comprar_documento($1,$2,$3,$4) token`, [
          cliente,
          request,
          randomUUID(),
          'y'.repeat(30),
        ])
      ).token,
      token,
    );
    await identity(cliente);
    assert.equal((await q(`select public.cine_comprobante($1) d`, [token])).d.qr_compra, codigo);
    assert.equal(
      (await q(`select public.cine_mi_reserva($1) d`, [token])).d.documento_pdf,
      'x'.repeat(30),
    );
    assert.equal((await q(`select public.cine_mis_reservas() d`)).d[0].qr_compra, codigo);
    assert.equal((await q(`select public.cine_mis_beneficios() d`)).d.puntos, 2200);
    await identity(admin);
    await assert.rejects(
      () => q(`select public.cine_adaptar_sala($1,'Cambio',true)`, [sala]),
      /compras/,
    );
    await identity(empleado);
    const validar = async (tipo, f = funcion) =>
      (await q(`select public.cine_validar_compra($1,$2,$3) d`, [codigo, tipo, f])).d;
    const codigoIndividual = (await q(`select public.cine_comprobante($1) d`, [token])).d
      .entradas[0].codigo;
    assert.equal(
      (await q(`select public.cine_validar_compra($1,'entrada',$2) d`, [codigoIndividual, funcion]))
        .d.ok,
      false,
    );
    assert.equal((await validar('entrada', futura)).ok, false);
    assert.equal((await validar('entrada')).ok, true);
    assert.equal((await validar('entrada')).ok, false);
    assert.equal((await validar('candy')).ok, true);
    assert.equal((await validar('candy')).ok, false);
    // Compatibilidad de una compra anterior con solo parte del ingreso utilizado.
    await db.exec('reset role');
    const antigua = await q(
      `insert into public.cine_reservas(solicitud,funcion_id,usuario_id,email,total,vence,estado)
      values(gen_random_uuid(),$1,$2,'prueba@example.com',2000,now(),'confirmada') returning id,qr_compra`,
      [funcion, cliente],
    );
    const usada = await q(
      `insert into public.cine_entradas(reserva_id,funcion_id,butaca,usada_en) values($1,$2,'B1',now()) returning codigo`,
      [antigua.id, funcion],
    );
    await q(`insert into public.cine_entradas(reserva_id,funcion_id,butaca) values($1,$2,'B2')`, [
      antigua.id,
      funcion,
    ]);
    await identity(empleado);
    assert.equal(
      (await q(`select public.cine_validar_compra($1,'entrada',$2) d`, [usada.codigo, funcion])).d
        .ok,
      false,
    );
    assert.equal(
      (
        await q(`select public.cine_validar_compra($1,'entrada',$2) d`, [
          antigua.qr_compra,
          funcion,
        ])
      ).d.mensaje,
      'Ingreso autorizado: B2',
    );
    assert.equal(
      (
        await q(`select public.cine_validar_compra($1,'entrada',$2) d`, [
          antigua.qr_compra,
          funcion,
        ])
      ).d.ok,
      false,
    );
    await identity(cliente);
    await q(`select public.cine_escribir_resena($1,5,'Muy buena')`, [token]);
    await q(`select public.cine_canjear($1,gen_random_uuid())`, [recompensa]);
    const canje = (await q(`select public.cine_mis_beneficios() d`)).d.canjes[0];
    assert.equal((await quote(futura, ['A1'], candy, canje.codigo)).total, 1000);
    await assert.rejects(() => quote(futura, ['A1'], [], canje.codigo), /producto canjeado/);
    assert.equal(
      (await quote(futura, ['A1'], [{ ...candy[0], cantidad: 2 }], canje.codigo)).total,
      1200,
    );
    await q(`select public.cine_canjear($1,gen_random_uuid())`, [entradaGratis]);
    const canjeEntrada = (await q(`select public.cine_mis_beneficios() d`)).d.canjes.find(
      (c) => c.nombre === 'Entrada gratis',
    );
    assert.equal((await quote(futura, ['R1', 'R2'], [], canjeEntrada.codigo)).total, 1250);
    // Fallo durante escritura económica: rollback de entradas, stock, saldo y PDF.
    const snapshot = await quote(futura, ['A1'], candy);
    const reqFallido = {
      ...request,
      funcion: futura,
      butacas: ['A1'],
      solicitud: randomUUID(),
      cotizacion: snapshot,
    };
    await db.exec('reset role');
    await db.exec(
      `create function public.fallo_stock() returns trigger language plpgsql as $$begin raise exception 'Fallo de prueba';end$$;create trigger fallo_stock before update on public.cine_productos for each row execute function public.fallo_stock();`,
    );
    await identity(null, 'service_role');
    await assert.rejects(
      () =>
        q(`select public.cine_comprar_documento($1,$2,$3,$4)`, [
          cliente,
          reqFallido,
          randomUUID(),
          'x'.repeat(30),
        ]),
      /Fallo de prueba/,
    );
    await db.exec('reset role');
    assert.equal(
      (
        await q(`select count(*)::int n from public.cine_reservas where solicitud=$1`, [
          reqFallido.solicitud,
        ])
      ).n,
      0,
    );
    assert.equal(
      (await q(`select stock from public.cine_productos where id=$1`, [producto])).stock,
      4,
    );
    await db.exec('drop trigger fallo_stock on public.cine_productos');
    await identity(cliente);
    await assert.rejects(() => quote(futura, ['A1'], [], bienvenida.codigo), /primera compra/);
    const cc = await quote(futura, ['A1'], [], 'FIJO');
    const cancelarReq = {
      ...request,
      funcion: futura,
      butacas: ['A1'],
      candy: [],
      cupon: 'FIJO',
      solicitud: randomUUID(),
      cotizacion: cc,
    };
    await identity(null, 'service_role');
    const tc = (
      await q(`select public.cine_comprar_documento($1,$2,$3,$4) token`, [
        cliente,
        cancelarReq,
        randomUUID(),
        'x'.repeat(30),
      ])
    ).token;
    await identity(cliente);
    await q(`select public.cine_cancelar($1)`, [tc]);
    await q(`select public.cine_cancelar($1)`, [tc]);
    assert.equal((await q(`select public.cine_mis_beneficios() d`)).d.credito, 850);
    await assert.rejects(() => quote(futura, ['A1'], [], bienvenida.codigo), /primera compra/);
    await identity(admin);
    await q(`select public.cine_editar_funcion($1,1100,'castellano','4D',30)`, [funcion]);
    const historico = (await q(`select public.cine_detalle_reserva($1) d`, [token])).d;
    assert.equal(
      historico.funcion.precio,
      1000,
      'El snapshot del recibo no cambia con el precio actual',
    );
    assert.equal(historico.documento_pdf, 'x'.repeat(30));
    const estreno = (
      await q(`select ((now() at time zone 'America/Argentina/Buenos_Aires')::date+3)::text fecha`)
    ).fecha;
    const prevPelicula = (
      await q(`select public.cine_guardar_pelicula($1,$2) id`, [
        {
          ...peliculaDatos,
          titulo: 'Preventa',
          slug: 'preventa',
          fecha_estreno: estreno,
          precio_preventa: 700,
        },
        [genero],
      ])
    ).id;
    const prevFuncion = (
      await q(
        `select public.cine_crear_funcion($1,null,now()+interval '3 days 4 hours',1000,'castellano','2D') id`,
        [prevPelicula],
      )
    ).id;
    assert.equal((await quote(prevFuncion)).total, 700);
    assert.equal((await quote(prevFuncion, ['R1'])).total, 875);
    await db.exec('reset role');
    await q(
      `update public.peliculas set fecha_estreno=(now() at time zone 'America/Argentina/Buenos_Aires')::date where id=$1`,
      [prevPelicula],
    );
    await identity(cliente);
    assert.equal((await quote(prevFuncion)).total, 1000);
    await db.exec('reset role');
    await q(
      `update public.peliculas set fecha_estreno=(now() at time zone 'America/Argentina/Buenos_Aires')::date+8 where id=$1`,
      [prevPelicula],
    );
    await identity(cliente);
    await assert.rejects(() => quote(prevFuncion), /preventa/);
    await identity(admin);
    assert.ok(
      (
        await q(
          `select public.cine_consultar_auditoria(now()-interval '1 day',now()+interval '1 day') d`,
        )
      ).d.some((a) => a.tabla === 'cine_funciones'),
    );
    await identity(null, 'anon');
    assert.ok(Array.isArray((await q(`select public.cine_cartelera() d`)).d));
    await assert.rejects(() => q(`select * from public.cine_reservas`), /permission denied/);
    await assert.rejects(
      () => q(`select public.cine_consultar_auditoria(now()-interval '1 day',now())`),
      /denegado|permission denied/,
    );
    console.log(
      'Documento: 532 butacas, pasillos, accesibles/VIP, sala automática, edad server-side, cupones, QR compartido, atomicidad/rollback, idempotencia, cancelación, canjes, auditoría y lectura pública: OK',
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
