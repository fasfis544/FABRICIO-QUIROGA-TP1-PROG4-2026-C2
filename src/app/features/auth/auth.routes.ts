/**
 * Anotacion de responsabilidad: Configuracion de rutas de Auth.Routes; concentra la responsabilidad de este modulo dentro de app/features/auth. Incluye principalmente: authRoutes.
 */
import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  { path: 'oauth', loadComponent: () => import('./oauth.component').then((m) => m.OAuthComponent) },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registro',
    loadComponent: () => import('./registro/registro.component').then((m) => m.RegistroComponent),
  },
  {
    path: 'recuperar-password',
    loadComponent: () =>
      import('./recuperar-password/recuperar-password.component').then(
        (m) => m.RecuperarPasswordComponent,
      ),
  },
  {
    path: 'restablecer-password',
    loadComponent: () =>
      import('./restablecer-password/restablecer-password.component').then(
        (m) => m.RestablecerPasswordComponent,
      ),
  },
  {
    path: 'confirmacion-email',
    loadComponent: () =>
      import('./confirmacion-email/confirmacion-email.component').then(
        (m) => m.ConfirmacionEmailComponent,
      ),
  },
];
