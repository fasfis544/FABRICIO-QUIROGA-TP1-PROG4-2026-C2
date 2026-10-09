/**
 * Anotacion de responsabilidad: Guard de navegacion de Rol.Guard; concentra la responsabilidad de este modulo dentro de app/core/guards. Incluye principalmente: rolGuard, sesion, rol.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { Rol } from '../auth/rol.model';
import { SesionService } from '../auth/sesion.service';

export function rolGuard(...permitidos: Rol[]): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(AuthService);
    const sesion = inject(SesionService);
    const router = inject(Router);
    await auth.refrescarPerfil();
    if (!sesion.autenticado()) {
      return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
    }
    const rol = sesion.rol();
    return (rol !== null && permitidos.includes(rol)) ||
      router.createUrlTree(['/errores/sin-permiso']);
  };
}
