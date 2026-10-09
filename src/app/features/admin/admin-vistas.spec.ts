/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Admin Vistas; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { adminRoutes } from './admin.routes';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { AdministracionService } from '../../data-access/cine/administracion.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { OfertasAdminService } from '../../data-access/cine/ofertas-admin.service';

describe('Administración separada por funcionalidades', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin', children: adminRoutes }]),
        {
          provide: OperacionesService,
          useValue: { salas: async () => [], funcionesAdministracion: async () => [] },
        },
        { provide: AdministracionService, useValue: {} },
        { provide: PeliculasService, useValue: { listar: async () => [] } },
        {
          provide: OfertasAdminService,
          useValue: {
            listar: async () => ({ producto: [], combo: [], cupon: [], recompensa: [] }),
            bienvenidaActual: async () => 20,
          },
        },
      ],
    }),
  );
  it('salas, funciones y tarifas muestran solo sus propios controles al navegar', async () => {
    const h = await RouterTestingHarness.create('/admin/salas');
    expect(h.routeNativeElement?.querySelector('#s-nombre')).not.toBeNull();
    expect(h.routeNativeElement?.querySelector('#f-pelicula')).toBeNull();
    await h.navigateByUrl('/admin/funciones');
    expect(h.routeNativeElement?.querySelector('#s-nombre')).toBeNull();
    expect(h.routeNativeElement?.querySelector('#f-pelicula')).not.toBeNull();
    await h.navigateByUrl('/admin/precios');
    expect(h.routeNativeElement?.querySelector('#s-nombre')).toBeNull();
    expect(h.routeNativeElement?.querySelector('#f-pelicula')).toBeNull();
    expect(h.routeNativeElement?.querySelector('h1')?.textContent).toBe('Precios y formatos');
  });
  it('cada sección de candy/promoción tiene tipo fijo y bienvenida solo en cupones', async () => {
    const h = await RouterTestingHarness.create();
    for (const [ruta, campo] of [
      ['candy/productos', '#oferta-stock'],
      ['candy/combos', '#oferta-nombre'],
      ['cupones', '#oferta-codigo'],
      ['recompensas', '#oferta-puntos'],
    ]) {
      await h.navigateByUrl('/admin/' + ruta);
      expect(h.routeNativeElement?.querySelector(campo)).not.toBeNull();
      expect(h.routeNativeElement?.querySelector('#oferta-tipo')).toBeNull();
      expect(!!h.routeNativeElement?.querySelector('#bienvenida-porcentaje')).toBe(
        ruta === 'cupones',
      );
      expect(!!h.routeNativeElement?.querySelector('#oferta-stock')).toBe(
        ruta === 'candy/productos',
      );
    }
  });
});
