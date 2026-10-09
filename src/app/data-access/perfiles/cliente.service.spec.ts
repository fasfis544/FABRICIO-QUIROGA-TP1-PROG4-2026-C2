/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Cliente.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { ClienteService, leerReserva } from './cliente.service';
import { BeneficiosService, leerBeneficios } from './beneficios.service';
import { leerCotizacion } from '../cine/checkout.service';
import { codigoEntrada } from '../../shared/entradas/escaner.component';
import { Carrito } from '../../features/compra/services/carrito.service';
describe('Área del cliente', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } }],
    });
  });
  it('no envía usuario ni rol para editar el perfil', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await TestBed.inject(ClienteService).editar('Ana', 'Cine');
    expect(rpc).toHaveBeenCalledWith('cine_editar_mi_perfil', {
      p_nombre: 'Ana',
      p_apellido: 'Cine',
    });
  });
  it('consulta el historial con identidad exclusivamente del servidor', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await TestBed.inject(ClienteService).reservas()).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('cine_mis_reservas', {});
  });
  it('solo envía los seis datos personales incluso si el objeto incluye privilegios', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const personales = {
      nombre: 'Ana',
      apellido: 'Cine',
      fecha_nacimiento: '1990-01-01',
      grupo_sanguineo: 'O+',
      color_ojos: 'Marrones',
      vacaciones_anuales: 14,
    };
    const alterado = {
      ...personales,
      id: 'ajeno',
      rol: 'administrador',
      activo: true,
      puntos: 900,
      credito: 999,
    };
    await TestBed.inject(ClienteService).completar(alterado);
    expect(rpc).toHaveBeenCalledWith('cine_completar_perfil', { p_datos: personales });
  });
  it('propaga un rechazo de propiedad de la reserva', async () => {
    rpc.mockResolvedValue({
      error: { message: 'Reserva no disponible para tu cuenta' },
      data: null,
    });
    await expect(TestBed.inject(ClienteService).reserva('ajena')).rejects.toThrow('tu cuenta');
  });
  it('rechaza datos de historial incompletos', () => {
    expect(() => leerReserva({ token: 'token' })).toThrow();
  });
  it('no inventa saldos ante respuestas inválidas', () => {
    expect(() => leerBeneficios({ credito: 100 })).toThrow();
  });
  it('rechaza cotizaciones inválidas en vez de habilitar checkout', () => {
    expect(() => leerCotizacion({ total: 200 })).toThrow();
  });
  it('rechaza una prestación que el servidor informa usada', async () => {
    rpc.mockResolvedValue({ data: { ok: false, mensaje: 'Candy ya retirado' }, error: null });
    await expect(
      TestBed.inject(BeneficiosService).validar('codigo', 'candy', 'funcion'),
    ).rejects.toThrow('ya retirado');
  });
  it('valida candy independientemente del ingreso', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, mensaje: 'Retiro autorizado', candy: [{ nombre: 'Combo', cantidad: 2 }] },
      error: null,
    });
    expect(await TestBed.inject(BeneficiosService).validar('codigo', 'candy', 'funcion')).toEqual({
      mensaje: 'Retiro autorizado',
      candy: '2 × Combo',
    });
    expect(rpc).toHaveBeenCalledWith('cine_validar_compra', {
      p_codigo: 'codigo',
      p_tipo: 'candy',
      p_funcion: 'funcion',
    });
  });
  it('conserva identificador idempotente de canje', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await TestBed.inject(BeneficiosService).canjear('recompensa', 'solicitud');
    expect(rpc).toHaveBeenCalledWith('cine_canjear', {
      p_recompensa: 'recompensa',
      p_solicitud: 'solicitud',
    });
  });
  it('scanner solo acepta UUID, no URLs ni texto arbitrario', () => {
    expect(codigoEntrada('https://sitio/123')).toBeNull();
    expect(codigoEntrada('<script>')).toBeNull();
    expect(codigoEntrada(' 11111111-1111-4111-8111-111111111111 ')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });
  it('el cambio de función no conserva productos de otro pedido', () => {
    const c = TestBed.inject(Carrito);
    c.seleccionar('f', ['A1']);
    c.candy.set([{ id: 'p', tipo: 'producto', cantidad: 1 }]);
    c.seleccionar('f', ['A2']);
    expect(c.candy().length).toBe(1);
    c.seleccionar('g', ['B1']);
    expect(c.candy()).toEqual([]);
    c.limpiar();
    expect(c.butacas()).toEqual([]);
  });
});
