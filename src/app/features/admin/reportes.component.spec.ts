/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Reportes.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AdministracionService } from '../../data-access/cine/administracion.service';
import { ReportesComponent } from './reportes.component';

describe('Métricas y pago simulado de reportes', () => {
  it('el top de películas muestra ingresos validados, no entradas vendidas', () => {
    TestBed.configureTestingModule({
      imports: [ReportesComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo: 'peliculas' } } } },
        { provide: AdministracionService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(ReportesComponent);
    fixture.componentInstance['reporte'].set({
      compras: 1,
      total: 1000,
      abonado: 1000,
      credito: 0,
      entradas: 10,
      diarios: [],
      candy: [],
      peliculas: [{ nombre: 'Prueba', cantidad: 10, vistas: 2, importe: 1000 }],
    });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const ranking = el.querySelector('ol');
    expect(ranking?.getAttribute('aria-label')).toBe('Ranking de ingresos validados');
    expect(ranking?.textContent).toContain('2 ingresos validados');
    expect(ranking?.textContent).not.toContain('10 entradas');
    expect(el.textContent).toContain('pago simulado, sin cobro real');
    expect(el.textContent).not.toContain('boletería');
  });
  it('consulta instantes Argentina y los documenta también en el período exportable', async () => {
    const reporte = vi
      .fn()
      .mockResolvedValue({
        compras: 0,
        total: 0,
        abonado: 0,
        credito: 0,
        entradas: 0,
        diarios: [],
        peliculas: [],
        candy: [],
      });
    TestBed.configureTestingModule({
      imports: [ReportesComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo: 'ventas' } } } },
        { provide: AdministracionService, useValue: { reporte } },
      ],
    });
    const f = TestBed.createComponent(ReportesComponent);
    f.componentInstance['datos'].set({ desde: '2030-01-31T23:30', hasta: '2030-02-01T00:30' });
    await f.componentInstance['consultar'](new Event('submit'));
    expect(reporte).toHaveBeenCalledExactlyOnceWith(
      '2030-02-01T02:30:00.000Z',
      '2030-02-01T03:30:00.000Z',
    );
    expect(f.componentInstance['periodoConsultado']()).toContain('Argentina (UTC−03)');
  });
});
