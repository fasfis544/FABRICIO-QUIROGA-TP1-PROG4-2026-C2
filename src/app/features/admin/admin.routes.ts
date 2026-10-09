/**
 * Anotacion de responsabilidad: Configuracion de rutas de Admin.Routes; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: adminPages, adminRoutes.
 */
import { Routes } from '@angular/router';

const adminPages: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'entradas',
    loadComponent: () => import('../cine/entrada.component').then((m) => m.EntradaComponent),
  },
  {
    path: 'ofertas',
    loadComponent: () => import('./ofertas-inicio.component').then((m) => m.OfertasInicioComponent),
  },
  {
    path: 'peliculas',
    loadComponent: () =>
      import('../cine/admin-peliculas.component').then((m) => m.AdminPeliculasComponent),
  },
  { path: 'peliculas/nueva', redirectTo: 'peliculas', pathMatch: 'full' },
  {
    path: 'peliculas/generos',
    loadComponent: () => import('./generos.component').then((m) => m.GenerosComponent),
  },
  {
    path: 'salas',
    data: { vista: 'salas' },
    loadComponent: () =>
      import('../cine/programacion.component').then((m) => m.ProgramacionComponent),
  },
  { path: 'salas/nueva', redirectTo: 'salas', pathMatch: 'full' },
  {
    path: 'salas/butacas',
    loadComponent: () =>
      import('./salas/editor-butacas/editor-butacas.component').then(
        (m) => m.EditorButacasComponent,
      ),
  },
  {
    path: 'funciones',
    data: { vista: 'funciones' },
    loadComponent: () =>
      import('../cine/programacion.component').then((m) => m.ProgramacionComponent),
  },
  { path: 'funciones/nueva', redirectTo: 'funciones', pathMatch: 'full' },
  {
    path: 'funciones/programacion',
    loadComponent: () =>
      import('./programacion-rango.component').then((m) => m.ProgramacionRangoComponent),
  },
  {
    path: 'candy/productos',
    data: { tipo: 'producto' },
    loadComponent: () => import('./ofertas.component').then((m) => m.OfertasComponent),
  },
  { path: 'candy/productos/nuevo', redirectTo: 'candy/productos', pathMatch: 'full' },
  { path: 'candy/categorias', redirectTo: 'candy/productos', pathMatch: 'full' },
  {
    path: 'candy/combos',
    data: { tipo: 'combo' },
    loadComponent: () => import('./ofertas.component').then((m) => m.OfertasComponent),
  },
  { path: 'candy/combos/nuevo', redirectTo: 'candy/combos', pathMatch: 'full' },
  {
    path: 'precios',
    data: { vista: 'precios' },
    loadComponent: () =>
      import('../cine/programacion.component').then((m) => m.ProgramacionComponent),
  },
  {
    path: 'cupones',
    data: { tipo: 'cupon' },
    loadComponent: () => import('./ofertas.component').then((m) => m.OfertasComponent),
  },
  { path: 'cupones/nuevo', redirectTo: 'cupones', pathMatch: 'full' },
  {
    path: 'recompensas',
    data: { tipo: 'recompensa' },
    loadComponent: () => import('./ofertas.component').then((m) => m.OfertasComponent),
  },
  { path: 'recompensas/nueva', redirectTo: 'recompensas', pathMatch: 'full' },
  {
    path: 'usuarios',
    loadComponent: () => import('./usuarios.component').then((m) => m.UsuariosComponent),
  },
  {
    path: 'usuarios/roles',
    loadComponent: () => import('./usuarios.component').then((m) => m.UsuariosComponent),
  },
  { path: 'reportes', redirectTo: 'reportes/ventas', pathMatch: 'full' },
  {
    path: 'reportes/ventas',
    data: { tipo: 'ventas' },
    loadComponent: () => import('./reportes.component').then((m) => m.ReportesComponent),
  },
  {
    path: 'reportes/peliculas',
    data: { tipo: 'peliculas' },
    loadComponent: () => import('./reportes.component').then((m) => m.ReportesComponent),
  },
  {
    path: 'reportes/candy',
    data: { tipo: 'candy' },
    loadComponent: () => import('./reportes.component').then((m) => m.ReportesComponent),
  },
  {
    path: 'auditoria',
    loadComponent: () => import('./auditoria.component').then((m) => m.AuditoriaComponent),
  },
];

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: adminPages,
  },
];
