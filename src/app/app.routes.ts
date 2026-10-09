/**
 * Anotacion de responsabilidad: Configuracion principal de rutas; conecta pantallas publicas, autenticacion, cliente y administracion con sus guards.
 */
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { rolGuard } from './core/guards/rol.guard';

export const routes: Routes = [
  { path: 'auth', loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes) },
  { path: '', loadChildren: () => import('./features/cartelera/cartelera.routes').then((m) => m.carteleraRoutes) },
  { path: 'compra', loadChildren: () => import('./features/compra/compra.routes').then((m) => m.compraRoutes) },
  { path: 'perfil', canActivate: [authGuard], canActivateChild: [authGuard], loadChildren: () => import('./features/perfil/perfil.routes').then((m) => m.perfilRoutes) },
  { path: 'admin', canActivate: [rolGuard('administrador')], canActivateChild: [rolGuard('administrador')], loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes) },
  { path: 'empleados', canActivate: [rolGuard('empleado')], canActivateChild: [rolGuard('empleado')], loadChildren: () => import('./features/empleados/empleados.routes').then((m) => m.empleadosRoutes) },
  { path: 'errores', loadChildren: () => import('./features/errores/errores.routes').then((m) => m.erroresRoutes) },
  { path: '**', redirectTo: 'errores/no-encontrado' },
];
