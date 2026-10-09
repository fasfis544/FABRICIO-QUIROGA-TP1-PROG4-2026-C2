/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Dashboard.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { AdministracionService } from '../../../data-access/cine/administracion.service';
import { OperacionesService } from '../../../data-access/cine/operaciones.service';

describe('DashboardComponent', () => {
  it('muestra el panel operativo en lugar del placeholder', async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        {
          provide: AdministracionService,
          useValue: { reporte: async () => ({ compras: 0, entradas: 0, abonado: 0 }) },
        },
        {
          provide: OperacionesService,
          useValue: { salas: async () => [], funcionesAdministracion: async () => [] },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('h1')?.textContent).toContain('Administración Aurora');
    expect(element.textContent).not.toContain('dashboard works!');
    expect(element.querySelector('a[href="/admin/peliculas"]')).not.toBeNull();
    expect(element.querySelector('a[href="/admin/funciones"]')).not.toBeNull();
    expect(element.querySelector('a[href="/admin/entradas"]')).not.toBeNull();
    expect(element.querySelectorAll('.area-card')).toHaveLength(6);
  });
});
