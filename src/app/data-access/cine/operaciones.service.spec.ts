/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Operaciones.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { OperacionesService } from './operaciones.service';
import { PeliculasService } from '../peliculas/peliculas.service';
import { lista, numero, objeto, texto } from './validacion';
import { CheckoutService } from './checkout.service';
import { OfertasAdminService } from './ofertas-admin.service';
describe('Operación de cine', () => {
  const rpc = vi.fn();
  const invoke = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ rpc, functions: { invoke } }) },
        },
      ],
    });
  });
  it('retira una sala sin adaptar ni reconstruir su distribución', async () => {
    rpc.mockResolvedValue({ error: null });
    await TestBed.inject(OperacionesService).cambiarEstadoSala('sala', false);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('cine_estado_catalogo', {
      p_tipo: 'sala',
      p_id: 'sala',
      p_activo: false,
    });
  });
  it('retira una película histórica sin reenviar clasificación, duración ni géneros', async () => {
    rpc.mockResolvedValue({ error: null });
    await TestBed.inject(PeliculasService).cambiarEstado('pelicula', false);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('cine_estado_catalogo', {
      p_tipo: 'pelicula',
      p_id: 'pelicula',
      p_activo: false,
    });
  });
  for (const tipo of ['producto', 'combo', 'cupon', 'recompensa'] as const) {
    it(`restaura ${tipo} sin reenviar precios, stock ni vigencia`, async () => {
      rpc.mockResolvedValue({ error: null });
      await TestBed.inject(OfertasAdminService).cambiarEstado(tipo, 'registro', true);
      expect(rpc).toHaveBeenCalledExactlyOnceWith('cine_estado_catalogo', {
        p_tipo: tipo,
        p_id: 'registro',
        p_activo: true,
      });
    });
  }
  it('propaga el bloqueo de la baja sin simular éxito', async () => {
    rpc.mockResolvedValue({ error: { message: 'Hay compras vigentes' } });
    await expect(TestBed.inject(PeliculasService).cambiarEstado('pelicula', false)).rejects.toThrow(
      'Hay compras vigentes',
    );
  });
  it('avisa si falta activar el SQL sin ocultar localmente el registro', async () => {
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Function not found' } });
    await expect(
      TestBed.inject(OperacionesService).cambiarEstadoSala('sala', false),
    ).rejects.toThrow('requieren activar la migración');
  });
  it('envía checkout con idempotencia y total esperado solo para detectar cambios', async () => {
    invoke.mockResolvedValue({ data: { token: 'token' }, error: null });
    expect(
      await TestBed.inject(CheckoutService).reservar(
        { funcion: 'funcion', butacas: ['A1'], candy: [], cupon: '', credito: 0 },
        { nombre: 'Ana', email: 'a@b.com', edad: true },
        'solicitud',
        1000,
      ),
    ).toBe('token');
    expect(invoke).toHaveBeenCalledWith('confirmar-compra', {
      body: {
        funcion: 'funcion',
        butacas: ['A1'],
        candy: [],
        cupon: '',
        credito: 0,
        email: 'a@b.com',
        nombre: 'Ana',
        edad: true,
        solicitud: 'solicitud',
        total_esperado: 1000,
        pago_simulado: true,
      },
    });
  });
  it('propaga un conflicto de asiento sin simular una reserva exitosa', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'Una butaca ya fue reservada' }), {
          status: 409,
        }),
      },
    });
    await expect(
      TestBed.inject(CheckoutService).reservar(
        { funcion: 'f', butacas: ['A1'], candy: [], cupon: '', credito: 0 },
        { nombre: 'Ana', email: 'a@b.com', edad: true },
        's',
        1000,
      ),
    ).rejects.toThrow('reservada');
  });
  it('rechaza una respuesta incompleta del comprobante', async () => {
    rpc.mockResolvedValue({ data: { estado: 'confirmada' }, error: null });
    await expect(TestBed.inject(OperacionesService).comprobante('token')).rejects.toThrow(
      'inválida',
    );
  });
  it('solicita catálogo público sin privilegios administrativos', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await TestBed.inject(PeliculasService).listar()).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('cine_cartelera', {}, { get: true });
  });
  it('guarda película y asociaciones con una única RPC', async () => {
    rpc.mockResolvedValue({ data: 'id', error: null });
    await TestBed.inject(PeliculasService).guardar({ titulo: 'Prueba', activa: false }, ['g']);
    expect(rpc).toHaveBeenCalledWith('cine_guardar_pelicula', {
      p_datos: { titulo: 'Prueba', activa: false },
      p_generos: ['g'],
    });
  });
  it('valida entrada en el servidor en vez de aceptarla localmente', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, mensaje: 'Ingreso autorizado', butaca: 'A1' },
      error: null,
    });
    expect(await TestBed.inject(OperacionesService).validar('codigo')).toBe(
      'Ingreso autorizado · Butaca A1',
    );
    expect(rpc).toHaveBeenCalledWith('cine_validar_entrada', { p_codigo: 'codigo' });
  });
  it('rechaza datos no tipados incorrectos', () => {
    expect(() => lista(null)).toThrow();
    expect(() => objeto([])).toThrow();
    expect(() => texto({ id: 1 }, 'id')).toThrow();
    expect(() => numero({ precio: null }, 'precio')).toThrow();
    expect(numero({ precio: '123.50' }, 'precio')).toBe(123.5);
  });
  it('solicita mantenimiento exclusivamente mediante RPC y conserva su motivo', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await TestBed.inject(OperacionesService).mantenerButacas('s', ['J1'], true, '  Reparación  ');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('cine_mantener_butacas', {
      p_sala: 's',
      p_codigos: ['J1'],
      p_bloqueada: true,
      p_motivo: 'Reparación',
    });
  });
  it('informa conexión/reconexión y deja de emitir callbacks al destruir', () => {
    let informar: ((estado: string) => void) | undefined;
    const canal = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback: (estado: string) => void) => {
        informar = callback;
        return canal;
      }),
    };
    const removeChannel = vi.fn().mockResolvedValue('ok');
    TestBed.overrideProvider(SupabaseService, {
      useValue: { getClient: () => ({ channel: () => canal, removeChannel }) },
    });
    const estado = vi.fn(),
      cambio = vi.fn();
    const dejar = TestBed.inject(OperacionesService).observar('f', cambio, estado);
    expect(estado).toHaveBeenCalledWith('conectando');
    informar?.('SUBSCRIBED');
    expect(estado).toHaveBeenLastCalledWith('conectada');
    informar?.('TIMED_OUT');
    expect(estado).toHaveBeenLastCalledWith('reconectando');
    const notificar = canal.on.mock.calls[0][2] as () => void;
    notificar();
    expect(cambio).toHaveBeenCalledOnce();
    dejar();
    informar?.('CLOSED');
    notificar();
    expect(estado).toHaveBeenCalledTimes(3);
    expect(cambio).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledWith(canal);
  });
});
