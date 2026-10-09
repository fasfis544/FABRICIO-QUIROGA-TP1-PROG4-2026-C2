/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Panel Filtros; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PanelComponent } from '../../cine/panel.component';
describe('Búsqueda del panel sin cambiar las seis áreas', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [PanelComponent], providers: [provideRouter([])] }),
  );
  it('busca herramientas sin depender de acentos y puede recuperar las seis áreas', () => {
    const f = TestBed.createComponent(PanelComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.area-card')).toHaveLength(6);
    const input: HTMLInputElement = f.nativeElement.querySelector('input');
    input.value = 'programacion';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.area-card')).toHaveLength(1);
    expect(f.nativeElement.querySelector('a[href="/admin/funciones"]')).not.toBeNull();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.area-card')).toHaveLength(6);
  });
  it('la búsqueda no amplía las áreas permitidas del panel del empleado', () => {
    const f = TestBed.createComponent(PanelComponent);
    f.componentRef.setInput('areas', ['operacion']);
    f.detectChanges();
    f.componentInstance['busqueda'].set('Películas');
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[href="/admin/peliculas"]')).toBeNull();
  });
});
