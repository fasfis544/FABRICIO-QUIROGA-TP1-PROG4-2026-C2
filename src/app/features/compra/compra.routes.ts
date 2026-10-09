/**
 * Anotacion de responsabilidad: Configuracion de rutas de Compra.Routes; concentra la responsabilidad de este modulo dentro de app/features/compra. Incluye principalmente: compraRoutes.
 */
import { Routes } from '@angular/router';

export const compraRoutes: Routes = [
  {
    path: 'confirmacion/:compraId',
    loadComponent: () =>
      import('../cine/comprobante.component').then((m) => m.ComprobanteComponent),
  },
  {
    path: ':funcionId/butacas',
    loadComponent: () => import('../cine/reserva.component').then((m) => m.ReservaComponent),
  },
  {
    path: ':funcionId/candy',
    loadComponent: () => import('./candy.component').then((m) => m.CandyComponent),
  },
  {
    path: ':funcionId/checkout',
    loadComponent: () => import('./checkout.component').then((m) => m.CheckoutComponent),
  },
];
