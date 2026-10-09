/**
 * Anotacion de responsabilidad: Configuracion de rutas de Empleados.Routes; concentra la responsabilidad de este modulo dentro de app/features/empleados. Incluye principalmente: empleadosRoutes.
 */
import { Routes } from '@angular/router';

export const empleadosRoutes: Routes = [
  {
    path: 'entrada',
    loadComponent: () => import('../cine/entrada.component').then((m) => m.EntradaComponent),
  },
  {
    path: 'candy',
    data: { candy: true },
    loadComponent: () => import('../cine/entrada.component').then((m) => m.EntradaComponent),
  },
];
