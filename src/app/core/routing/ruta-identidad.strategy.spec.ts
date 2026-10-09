/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Ruta Identidad.Strategy; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, RouteReuseStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RutaIdentidadStrategy } from './ruta-identidad.strategy';
@Component({ template: `<h1>{{ id }}</h1>` })
class PantallaIdentidad {
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
}
describe('Navegación entre distintas identidades', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'peliculas/:id', component: PantallaIdentidad },
          { path: 'compra/confirmacion/:id', component: PantallaIdentidad },
        ]),
        { provide: RouteReuseStrategy, useClass: RutaIdentidadStrategy },
      ],
    }),
  );
  it('cambia película/compra sin conservar snapshots y conserva estado al cambiar solo query', async () => {
    const harness = await RouterTestingHarness.create();
    const a = await harness.navigateByUrl('/peliculas/a', PantallaIdentidad);
    const misma = await harness.navigateByUrl('/peliculas/a?buscar=otra', PantallaIdentidad);
    expect(misma).toBe(a);
    const b = await harness.navigateByUrl('/peliculas/b', PantallaIdentidad);
    expect(b).not.toBe(a);
    expect(b.id).toBe('b');
    await harness.navigateByUrl('/compra/confirmacion/a', PantallaIdentidad);
    const compra = await harness.navigateByUrl('/compra/confirmacion/b', PantallaIdentidad);
    expect(compra.id).toBe('b');
    expect(harness.routeNativeElement?.textContent).toContain('b');
  });
});
