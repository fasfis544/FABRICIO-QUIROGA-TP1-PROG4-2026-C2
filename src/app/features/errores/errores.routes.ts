/**
 * Anotacion de responsabilidad: Configuracion de rutas de Errores.Routes; concentra la responsabilidad de este modulo dentro de app/features/errores. Incluye principalmente: erroresRoutes.
 */
import { Routes } from '@angular/router';

export const erroresRoutes: Routes = [
  { path: 'no-encontrado', loadComponent: () => import('./no-encontrado/no-encontrado.component').then((m) => m.NoEncontradoComponent) },
  { path: 'sin-permiso', loadComponent: () => import('./sin-permiso/sin-permiso.component').then((m) => m.SinPermisoComponent) },
];
