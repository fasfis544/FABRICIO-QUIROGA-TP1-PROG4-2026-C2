/**
 * Anotacion de responsabilidad: Guard de navegacion de Auth.Guard; concentra la responsabilidad de este modulo dentro de app/core/guards. Incluye principalmente: authGuard, sesion.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SesionService } from '../auth/sesion.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const sesion = inject(SesionService);
  const router = inject(Router);
  await auth.refrescarPerfil();
  return sesion.autenticado() || router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};
