/**
 * Anotacion de responsabilidad: Configuracion de rutas de Cartelera.Routes; concentra la responsabilidad de este modulo dentro de app/features/cartelera. Incluye principalmente: carteleraRoutes.
 */
import { Routes } from '@angular/router';

export const carteleraRoutes: Routes = [
  { path: '', loadComponent: () => import('./inicio/inicio.component').then((m) => m.InicioComponent) },
  { path: 'peliculas', loadComponent: () => import('../cine/catalogo.component').then((m) => m.CatalogoComponent) },
  { path: 'peliculas/:id', loadComponent: () => import('../cine/detalle.component').then((m) => m.DetalleComponent) },
  { path: 'proximamente', data: { proximamente: true }, loadComponent: () => import('../cine/catalogo.component').then((m) => m.CatalogoComponent) },
];
