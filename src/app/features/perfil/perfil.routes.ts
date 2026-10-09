/**
 * Anotacion de responsabilidad: Configuracion de rutas de Perfil.Routes; concentra la responsabilidad de este modulo dentro de app/features/perfil. Incluye principalmente: perfilRoutes.
 */
import { Routes } from '@angular/router';

export const perfilRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./mi-perfil/mi-perfil.component').then((m) => m.MiPerfilComponent),
  },
  {
    path: 'compras',
    loadComponent: () => import('./historial.component').then((m) => m.HistorialComponent),
  },
  {
    path: 'compras/:id',
    loadComponent: () =>
      import('./detalle-reserva.component').then((m) => m.DetalleReservaComponent),
  },
  {
    path: 'peliculas',
    data: { vistas: true },
    loadComponent: () => import('./historial.component').then((m) => m.HistorialComponent),
  },
  ...['puntos', 'recompensas', 'canjes', 'credito', 'notificaciones'].map((path) => ({
    path,
    data: { tipo: path },
    loadComponent: () => import('./beneficios.component').then((m) => m.BeneficiosComponent),
  })),
];
