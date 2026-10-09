/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Detalle.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DetalleComponent } from './detalle.component';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { BeneficiosService } from '../../data-access/perfiles/beneficios.service';
import { SesionService } from '../../core/auth/sesion.service';
import { DiaCineService } from '../../core/dia-cine.service';

describe('Detalle y preventa sin información vieja', () => {
  const pelicula: Pelicula = { id: 'p', titulo: 'Prueba', slug: 'prueba', sinopsis: 'Una historia', duracion_minutos: 90, clasificacion: 'ATP', fecha_estreno: '2030-01-10', activa: true, poster_url: '/images/afiche-respaldo.svg', generos: [], precio_preventa: 500 };
  async function crear() {
    const listar = vi.fn().mockResolvedValue([pelicula]);
    const funciones = vi.fn().mockResolvedValue([]);
    const resenas = vi.fn().mockResolvedValue({ promedio: 0, resenas: [] });
    const hoy = signal('2030-01-02');
    const dejar = vi.fn();
    TestBed.configureTestingModule({ imports: [DetalleComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'p']]) } } },
      { provide: PeliculasService, useValue: { listar } },
      { provide: OperacionesService, useValue: { funciones, observar: () => dejar } },
      { provide: BeneficiosService, useValue: { resenas } },
      { provide: SesionService, useValue: { autenticado: () => false } },
      { provide: DiaCineService, useValue: { hoy } },
    ] });
    const f = TestBed.createComponent(DetalleComponent); f.detectChanges(); await f.whenStable();
    await vi.waitFor(() => { f.detectChanges(); expect(f.componentInstance['cargando']()).toBe(false); });
    return { f, listar, funciones, resenas, hoy, dejar };
  }
  it('preventa cambia a los siete días y no se habilita sin precio especial', async () => {
    const { f, hoy } = await crear(); expect(f.componentInstance['enVenta'](pelicula)).toBe(false);
    hoy.set('2030-01-03'); expect(f.componentInstance['enVenta'](pelicula)).toBe(true);
    expect(f.componentInstance['enVenta']({ ...pelicula, precio_preventa: null })).toBe(false);
    hoy.set('2030-01-10'); expect(f.componentInstance['enVenta']({ ...pelicula, precio_preventa: null })).toBe(true);
  });
  it('si desaparece la película la recarga elimina funciones anteriores', async () => {
    const { f, listar } = await crear(); listar.mockResolvedValueOnce([]); await f.componentInstance['cargar'](); f.detectChanges();
    expect(f.componentInstance['pelicula']()).toBeNull(); expect(f.componentInstance['funciones']()).toEqual([]);
    expect(f.nativeElement.querySelector('h1')?.textContent).toBe('Detalle de película');
    expect(f.nativeElement.querySelector('button[appRestrictEdad]')).toBeNull(); expect(f.componentInstance['error']()).toContain('no disponible');
  });
  it('error de reseñas no se confunde con ausencia ni permanece tras un reintento exitoso', async () => {
    const { f, resenas } = await crear(); resenas.mockRejectedValueOnce(new Error('No se pudo leer reseñas'));
    await f.componentInstance['cargar'](); f.detectChanges(); expect(f.nativeElement.textContent).not.toContain('Todavía no hay reseñas');
    expect(f.componentInstance['errorResenas']()).not.toBe(''); await f.componentInstance['cargar']();
    expect(f.componentInstance['errorResenas']()).toBe('');
  });
  it('dos lecturas superpuestas no permiten que la más vieja sobrescriba el catálogo nuevo', async () => {
    const { f, listar } = await crear(); let resolver!: (peliculas: Pelicula[]) => void;
    listar.mockReturnValueOnce(new Promise<Pelicula[]>((resolve) => { resolver = resolve; }));
    const vieja = f.componentInstance['cargar'](); listar.mockResolvedValueOnce([{ ...pelicula, titulo: 'Título nuevo' }]);
    await f.componentInstance['cargar'](); resolver([{ ...pelicula, titulo: 'Título viejo' }]); await vieja;
    expect(f.componentInstance['pelicula']()?.titulo).toBe('Título nuevo');
  });
  it('no repuebla datos ni listeners después de destruir la pantalla', async () => {
    const { f, listar, dejar } = await crear(); let resolver!: (peliculas: Pelicula[]) => void;
    listar.mockReturnValueOnce(new Promise<Pelicula[]>((resolve) => { resolver = resolve; }));
    const pendiente = f.componentInstance['cargar'](); f.destroy(); resolver([pelicula]); await pendiente;
    expect(f.componentInstance['pelicula']()).toBeNull(); expect(dejar).toHaveBeenCalledOnce();
  });
});
