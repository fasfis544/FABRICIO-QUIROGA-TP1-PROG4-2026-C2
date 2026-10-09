/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Reserva.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { OperacionesService, Disponibilidad } from '../../data-access/cine/operaciones.service';
import { ReservaComponent } from './reserva.component';
import { RedService } from '../../core/red.service';
import { EstadoConexion } from '../../data-access/cine/operaciones.service';
describe('Disponibilidad automática', () => {
  const disponibilidad = vi.fn();
  const dejar = vi.fn();
  const observar = vi.fn();
  const datos: Disponibilidad = {
    funcion: {
      id: 'f',
      pelicula_id: 'p',
      sala_id: 's',
      inicio: '2030-01-01T20:00:00Z',
      fin: '2030-01-01T22:00:00Z',
      precio: 1000,
      activa: true,
    },
    sala: { id: 's', nombre: 'Sala', filas: 2, columnas: 4, activa: true },
    ocupadas: [],
    butacas: [1, 2, 3, 4].map((n) => ({
      codigo: 'A' + n,
      fila: 'A',
      columna: n,
      bloque: 1,
      tipo: 'normal' as const,
      precio: 1000,
    })),
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    disponibilidad.mockResolvedValue(datos);
    observar.mockReturnValue(dejar);
    TestBed.configureTestingModule({
      imports: [ReservaComponent],
      providers: [
        { provide: OperacionesService, useValue: { disponibilidad, observar } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['funcionId', 'f']]) } },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(document, 'hidden');
    vi.useRealTimers();
  });
  it('actualiza cada 15 segundos y elimina una selección ocupada por otra reserva', async () => {
    const fixture = TestBed.createComponent(ReservaComponent);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const boton = fixture.nativeElement.querySelector('[aria-label^="A1,"]') as HTMLButtonElement;
    boton.click();
    fixture.detectChanges();
    disponibilidad.mockResolvedValue({ ...datos, ocupadas: ['A1'] });
    await vi.advanceTimersByTimeAsync(15000);
    fixture.detectChanges();
    expect(disponibilidad).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('dejó de estar disponible');
    expect(boton.disabled).toBe(true);
    fixture.destroy();
    expect(dejar).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30000);
    expect(disponibilidad).toHaveBeenCalledTimes(2);
  });
  it('no consulta automáticamente cuando la pestaña está oculta', async () => {
    const fixture = TestBed.createComponent(ReservaComponent);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    await vi.advanceTimersByTimeAsync(30000);
    expect(disponibilidad).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it('elimina selección y deshabilita asientos cuando llega mantenimiento por Realtime', async () => {
    const fixture = TestBed.createComponent(ReservaComponent);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label^="A1,"]');
    boton.click();
    fixture.detectChanges();
    disponibilidad.mockResolvedValue({ ...datos, bloqueadas: ['A1'] });
    const cambio = observar.mock.calls[0][1] as () => void;
    cambio();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-label')).toContain('mantenimiento');
    expect(fixture.componentInstance['seleccion']()).toEqual([]);
    fixture.componentInstance['elegir']('A1');
    expect(fixture.componentInstance['seleccion']()).toEqual([]);
    fixture.destroy();
  });
  it('muestra estado y timestamp solo después de una consulta exitosa y recarga al reconectar', async () => {
    const f = TestBed.createComponent(ReservaComponent);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.detectChanges();
    expect(f.componentInstance['ultimaActualizacion']()).not.toBeNull();
    expect(f.nativeElement.textContent).toContain('Libres: 4');
    const estado = observar.mock.calls[0][2] as (v: EstadoConexion) => void;
    estado('reconectando');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('respaldo cada 15 segundos');
    estado('conectada');
    await vi.advanceTimersByTimeAsync(0);
    expect(disponibilidad).toHaveBeenCalledTimes(2);
    f.destroy();
  });
  it('sin conexión conserva selección pero no consulta ni permite elegir/continuar', async () => {
    const f = TestBed.createComponent(ReservaComponent);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.componentInstance['elegir']('A1');
    TestBed.inject(RedService).online.set(false);
    f.detectChanges();
    f.componentInstance['elegir']('A2');
    await f.componentInstance['cargar']();
    expect(f.componentInstance['seleccion']()).toEqual(['A1']);
    expect(disponibilidad).toHaveBeenCalledOnce();
    expect(f.nativeElement.textContent).toContain('Sin conexión');
    expect(f.nativeElement.querySelector('form button[type="button"]').disabled).toBe(true);
    f.destroy();
  });
  it('recuperar visibilidad revalida y un fallo no cambia la última consulta exitosa', async () => {
    const f = TestBed.createComponent(ReservaComponent);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    const ultima = f.componentInstance['ultimaActualizacion']();
    disponibilidad.mockRejectedValueOnce(new Error('Sin conexión'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(disponibilidad).toHaveBeenCalledTimes(2);
    expect(f.componentInstance['ultimaActualizacion']()).toBe(ultima);
    expect(f.componentInstance['datos']()).toBeNull();
    f.destroy();
  });
  it('un reintento exitoso limpia el aviso de fallo y no acepta códigos inexistentes', async () => {
    const f = TestBed.createComponent(ReservaComponent); f.detectChanges(); await vi.advanceTimersByTimeAsync(0);
    disponibilidad.mockRejectedValueOnce(new Error('Sin conexión')); await f.componentInstance['cargar'](); expect(f.componentInstance['error']()).toContain('conexión');
    await f.componentInstance['cargar'](); expect(f.componentInstance['error']()).toBe(''); f.componentInstance['elegir']('Z99'); expect(f.componentInstance['seleccion']()).toEqual([]); f.destroy();
  });
});
