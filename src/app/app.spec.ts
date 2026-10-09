/**
 * Anotacion de responsabilidad: Pruebas automatizadas de App; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideRouter } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { SesionService } from './core/auth/sesion.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: { cerrarSesion: vi.fn() } }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the brand and login link', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('CINE AURORA');
    expect(compiled.querySelector('.profile-action')?.getAttribute('href')).toBe('/auth/login');
  });
  for (const rol of ['administrador', 'empleado', 'cliente']) {
    it(`Mi cuenta abre el perfil personal para ${rol}`, async () => {
      TestBed.overrideProvider(SesionService, {
        useValue: {
          cargada: () => true,
          autenticado: () => true,
          rol: () => rol,
          nombre: () => 'Ana',
          inicial: () => 'A',
        },
      });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.profile-action')?.getAttribute('href')).toBe('/perfil');
      expect(el.querySelector('.footer a')?.getAttribute('href')).toBe('/perfil');
    });
  }
});
