/**
 * Anotacion de responsabilidad: Punto de entrada de Angular; inicia la aplicacion raiz con la configuracion definida en app.config.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
