/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Resumen Admin.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ResumenAdminComponent } from './resumen-admin.component';
import { AdministracionService } from '../../../data-access/cine/administracion.service';
import { OperacionesService } from '../../../data-access/cine/operaciones.service';
describe('Indicadores administrativos con datos autorizados', () => {
  async function crear(error = false) {
    const reporte = vi.fn().mockResolvedValue({ compras: 2, entradas: 3, abonado: 900 });
    if (error) reporte.mockRejectedValueOnce(new Error('Acceso denegado'));
    TestBed.configureTestingModule({
      imports: [ResumenAdminComponent],
      providers: [
        provideRouter([]),
        { provide: AdministracionService, useValue: { reporte } },
        {
          provide: OperacionesService,
          useValue: {
            salas: async () => [{ activa: true }, { activa: false }],
            funcionesAdministracion: async () => [
              { activa: true, inicio: '2099-01-01T20:00:00Z' },
              { activa: false, inicio: '2099-01-01T20:00:00Z' },
              { activa: true, inicio: '2000-01-01T20:00:00Z' },
            ],
          },
        },
      ],
    });
    const f = TestBed.createComponent(ResumenAdminComponent);
    f.detectChanges();
    await f.whenStable();
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.componentInstance['cargando']()).toBe(false);
    });
    f.detectChanges();
    return { f, reporte };
  }
  it('resume siete días y cuenta funciones futuras sin afirmar venta disponible', async () => {
    const { f, reporte } = await crear();
    expect(f.componentInstance['datos']()).toMatchObject({
      compras: 2,
      entradas: 3,
      neto: 900,
      salas: 1,
      funciones: 1,
    });
    const [desde, hasta] = reporte.mock.calls[0];
    expect(Date.parse(hasta) - Date.parse(desde)).toBe(7 * 86400000);
    expect(f.nativeElement.textContent).toContain('sin cobro real');
    expect(f.nativeElement.textContent).toContain('no garantiza venta habilitada');
  });
  it('no convierte fallos en ceros ni elimina la navegación, y permite reintentar', async () => {
    const { f } = await crear(true);
    expect(f.componentInstance['datos']()).toBeNull();
    expect(f.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(f.nativeElement.querySelector('a[href="/admin/reportes/ventas"]')).not.toBeNull();
    await f.componentInstance['cargar']();
    expect(f.componentInstance['datos']()?.compras).toBe(2);
  });
});
