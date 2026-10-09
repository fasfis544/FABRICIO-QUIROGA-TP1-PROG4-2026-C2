/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Errores.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NoEncontradoComponent } from './no-encontrado/no-encontrado.component';
import { SinPermisoComponent } from './sin-permiso/sin-permiso.component';

describe('Errores operativos y accesibles', () => {
  for (const [component, texto, enlaces] of [
    [NoEncontradoComponent, 'No encontramos esta página', ['/peliculas', '/']],
    [SinPermisoComponent, 'No tenés permiso para acceder', ['/auth/login', '/peliculas']],
  ] as const) {
    it(`muestra ${texto} sin plantilla y con rutas de recuperación`, async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent<NoEncontradoComponent | SinPermisoComponent>(
        component,
      );
      fixture.detectChanges();
      await fixture.whenStable();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('h1')?.textContent).toContain(texto);
      expect(el.textContent).not.toContain('works!');
      expect(el.querySelector('section')?.getAttribute('aria-labelledby')).toBe(
        el.querySelector('h1')?.id,
      );
      expect([...el.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
        ...enlaces,
      ]);
    });
  }
  it('la ruta comodín presenta una pantalla 404 real', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'errores/no-encontrado', component: NoEncontradoComponent },
          { path: '**', redirectTo: 'errores/no-encontrado' },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ruta-que-no-existe', NoEncontradoComponent);
    expect(harness.routeNativeElement?.textContent).toContain('Error 404');
  });
});
