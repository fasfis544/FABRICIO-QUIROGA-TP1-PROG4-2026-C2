/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Administracion.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FuncionAdminComponent } from './funcion-admin.component';
import { AdminPeliculasComponent } from '../cine/admin-peliculas.component';
import { GenerosComponent } from './generos.component';
import { AuditoriaComponent } from './auditoria.component';
import { OfertasComponent } from './ofertas.component';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { AdministracionService } from '../../data-access/cine/administracion.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { AfichesService } from '../../data-access/peliculas/afiches.service';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { OfertasAdminService } from '../../data-access/cine/ofertas-admin.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';

describe('Regresiones administrativas', () => {
  const pelicula: Pelicula = {
    id: 'p',
    titulo: 'Prueba',
    slug: 'prueba',
    sinopsis: 'Prueba',
    duracion_minutos: 90,
    clasificacion: 'ATP',
    fecha_estreno: '2020-01-01',
    activa: true,
    idioma: 'castellano',
    formato: '4D',
    poster_url: 'https://example.com/poster.png',
    generos: [{ id: 'g', nombre: 'Drama' }],
  };
  const editarFuncion = vi.fn(),
    guardarPelicula = vi.fn(),
    cancelarFuncion = vi.fn(),
    reprogramarFuncion = vi.fn(),
    rpc = vi.fn(),
    order = vi.fn(),
    guardarOferta = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    editarFuncion.mockResolvedValue(undefined);
    guardarPelicula.mockResolvedValue('p');
    rpc.mockResolvedValue({ data: 'g', error: null });
    order.mockResolvedValue({
      data: [{ id: 'g', nombre: 'Drama', slug: 'drama', activa: true }],
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: OperacionesService, useValue: { editarFuncion } },
        { provide: AdministracionService, useValue: { cancelarFuncion, reprogramarFuncion } },
        {
          provide: PeliculasService,
          useValue: {
            listar: vi.fn().mockResolvedValue([pelicula]),
            generos: vi.fn().mockResolvedValue([
              { id: 'g', nombre: 'Drama', activo: true },
              { id: 'inactivo', nombre: 'Histórico', activo: false },
            ]),
            guardar: guardarPelicula,
          },
        },
        { provide: AfichesService, useValue: { subir: vi.fn() } },
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ rpc, from: () => ({ select: () => ({ order }) }) }) },
        },
        {
          provide: OfertasAdminService,
          useValue: {
            listar: vi
              .fn()
              .mockResolvedValue({ producto: [], combo: [], cupon: [], recompensa: [] }),
            bienvenidaActual: vi.fn().mockResolvedValue(20),
            guardar: guardarOferta,
          },
        },
      ],
    });
  });
  it('muestra 4D y guarda 4D sin tocar el selector, también tras recargar', async () => {
    const f = TestBed.createComponent(FuncionAdminComponent);
    const funcion = {
      id: 'f',
      pelicula_id: 'p',
      sala_id: 's',
      inicio: '2030-01-01T23:00:00Z',
      fin: '2030-01-02T00:30:00Z',
      precio: 1000,
      activa: true,
      formato: '4D',
      idioma: 'subtitulada',
      vip_porcentaje: 25,
    };
    f.componentRef.setInput('funcion', funcion);
    f.componentRef.setInput('titulo', 'Prueba');
    f.componentRef.setInput('sala', 'Sala');
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const select = (f.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#formato-f')!;
    expect(select.value).toBe('4D');
    await f.componentInstance['guardar']();
    expect(editarFuncion).toHaveBeenLastCalledWith('f', 1000, 'subtitulada', '4D', 25);
    f.componentRef.setInput('funcion', { ...funcion });
    f.detectChanges();
    await f.whenStable();
    expect(select.value).toBe('4D');
  });
  it('exige confirmación y motivo para cancelar o reprogramar', async () => {
    const f = TestBed.createComponent(FuncionAdminComponent);
    f.componentRef.setInput('funcion', {
      id: 'f',
      pelicula_id: 'p',
      sala_id: 's',
      inicio: '2030-01-01T23:00:00Z',
      fin: '2030-01-02T00:30:00Z',
      precio: 1000,
      activa: true,
    });
    f.componentRef.setInput('titulo', 'Prueba');
    f.componentRef.setInput('sala', 'Sala');
    f.detectChanges();
    await f.whenStable();
    await f.componentInstance['cancelar']();
    expect(cancelarFuncion).not.toHaveBeenCalled();
    f.componentInstance['datos'].update((d) => ({
      ...d,
      motivo: 'Cambio autorizado',
      confirmado: true,
    }));
    await f.componentInstance['cancelar']();
    expect(cancelarFuncion).toHaveBeenCalledWith('f', 'Cambio autorizado');
    expect(f.componentInstance['datos']().confirmado).toBe(false);
  });
  it('conserva el ID tras alta de película; el siguiente guardado edita', async () => {
    const f = TestBed.createComponent(AdminPeliculasComponent);
    f.detectChanges();
    await f.whenStable();
    f.componentInstance['formulario'].setValue({
      titulo: pelicula.titulo,
      slug: pelicula.slug,
      sinopsis: pelicula.sinopsis,
      duracion_minutos: 90,
      clasificacion: 'ATP',
      idioma: 'castellano',
      formato: '4D',
      fecha_estreno: '2020-01-01',
      precio_preventa: null,
      poster_url: pelicula.poster_url,
      activa: true,
      generos: ['g'],
    });
    await f.componentInstance['guardar']();
    await f.componentInstance['guardar']();
    expect(guardarPelicula).toHaveBeenCalledTimes(2);
    expect(guardarPelicula.mock.calls[0][0].id).toBeUndefined();
    expect(guardarPelicula.mock.calls[1][0].id).toBe('p');
  });
  it('no ofrece géneros inactivos en altas pero conserva los ya asociados', async () => {
    const f = TestBed.createComponent(AdminPeliculasComponent);
    f.detectChanges();
    await f.componentInstance['cargar']();
    f.detectChanges();
    expect(f.componentInstance['generosDisponibles']().map((g) => g.id)).toEqual(['g']);
    f.componentInstance['editar']({
      ...pelicula,
      generos: [{ id: 'inactivo', nombre: 'Histórico' }],
    });
    f.detectChanges();
    expect(f.componentInstance['generosDisponibles']().map((g) => g.id)).toContain('inactivo');
    f.componentInstance['nueva']();
    expect(f.componentInstance['generosDisponibles']().map((g) => g.id)).not.toContain('inactivo');
  });
  it('conserva el UUID devuelto al crear un género', async () => {
    const f = TestBed.createComponent(GenerosComponent);
    f.detectChanges();
    await f.whenStable();
    f.componentInstance['formulario'].patchValue({ nombre: 'Drama', slug: 'drama' });
    await f.componentInstance['guardar']();
    await f.componentInstance['guardar']();
    expect(rpc.mock.calls[1][1].p_datos.id).toBe('g');
  });
  it('traduce conflictos de unicidad a un mensaje legible', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    const f = TestBed.createComponent(GenerosComponent);
    f.detectChanges();
    await f.whenStable();
    f.componentInstance['formulario'].patchValue({ nombre: 'Drama', slug: 'drama' });
    await f.componentInstance['guardar']();
    expect(f.componentInstance['error']()).toContain('Ya existe');
  });
  it('rechaza fechas invertidas localmente y acepta IDs de ambas auditorías', async () => {
    const f = TestBed.createComponent(AuditoriaComponent);
    f.componentInstance['formulario'].setValue({
      desde: '2030-01-02T10:00',
      hasta: '2030-01-01T10:00',
    });
    await f.componentInstance['consultar'](0);
    expect(rpc).not.toHaveBeenCalled();
    expect(f.componentInstance['rangoError']()).toContain('posterior');
    rpc.mockResolvedValue({
      data: [
        {
          id: 'catalogo:1',
          tabla: 'peliculas',
          operacion: 'UPDATE',
          usuario_id: null,
          creada: '2030-01-01T11:00:00Z',
        },
        {
          id: 'cine:1',
          tabla: 'cine_funciones',
          operacion: 'INSERT',
          usuario_id: null,
          creada: '2030-01-01T11:00:00Z',
        },
      ],
      error: null,
    });
    f.componentInstance['formulario'].setValue({
      desde: '2030-01-01T10:00',
      hasta: '2030-01-02T10:00',
    });
    await f.componentInstance['consultar'](0);
    expect(f.componentInstance['registros']().map((r) => r.id)).toEqual(['catalogo:1', 'cine:1']);
  });
  it('muestra error junto al stock negativo sin llamar al backend', async () => {
    const f = TestBed.createComponent(OfertasComponent);
    f.detectChanges();
    await f.whenStable();
    f.componentInstance['datos'].update((d) => ({ ...d, nombre: 'Producto', stock: -1 }));
    await f.componentInstance['guardar'](new Event('submit'));
    f.detectChanges();
    expect(guardarOferta).not.toHaveBeenCalled();
    expect(
      (f.nativeElement as HTMLElement).querySelector('#oferta-stock-error')?.textContent,
    ).toContain('mayor o igual a cero');
  });
});
