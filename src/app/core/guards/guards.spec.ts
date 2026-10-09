/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Guards; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, provideRouter, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SesionService } from '../auth/sesion.service';
import { authGuard } from './auth.guard';
import { rolGuard } from './rol.guard';

describe('Guards de sesión y rol', () => {
  let autenticado: boolean;
  let rol: string | null;
  beforeEach(() => {
    autenticado = false;
    rol = null;
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { refrescarPerfil: () => Promise.resolve() } },
      { provide: SesionService, useValue: { autenticado: () => autenticado, rol: () => rol } },
    ] });
  });
  async function ejecutar(guard: CanActivateFn) {
    return await TestBed.runInInjectionContext(() => guard(
      {} as ActivatedRouteSnapshot, { url: '/admin/usuarios' } as RouterStateSnapshot,
    ));
  }
  it('envía al login preservando la ruta solicitada', async () => {
    const router = TestBed.inject(Router);
    expect(await ejecutar(authGuard)).toEqual(router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: '/admin/usuarios' },
    }));
  });
  it('permite acceder con el rol correcto y deniega los demás', async () => {
    autenticado = true;
    rol = 'cliente';
    expect(await ejecutar(rolGuard('administrador'))).toEqual(
      TestBed.inject(Router).createUrlTree(['/errores/sin-permiso']),
    );
    rol = 'administrador';
    expect(await ejecutar(rolGuard('administrador'))).toBe(true);
    expect(await ejecutar(authGuard)).toBe(true);
  });
});
