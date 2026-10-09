/**
 * Anotacion de responsabilidad: Configuracion global de Angular; registra router, Service Worker, manejo de errores y servicios base.
 */
import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { RutaIdentidadStrategy } from './core/routing/ruta-identidad.strategy';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: RutaIdentidadStrategy },
    provideServiceWorker('cine-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
