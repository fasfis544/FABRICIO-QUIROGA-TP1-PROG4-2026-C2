/**
 * authGuard protege rutas: inyecta los servicios de autenticación, sesión y router, y espera a que se actualice el perfil.
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
