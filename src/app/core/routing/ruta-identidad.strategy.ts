/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Ruta Identidad.Strategy; concentra la responsabilidad de este modulo dentro de app/core/routing. Incluye principalmente: RutaIdentidadStrategy, claves.
 */
import { Service } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/** Una película, función o compra diferente necesita su propio estado y suscripciones. */
@Service()
export class RutaIdentidadStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    current: ActivatedRouteSnapshot,
  ): boolean {
    const claves = Object.keys(future.params);
    return (
      super.shouldReuseRoute(future, current) &&
      claves.length === Object.keys(current.params).length &&
      claves.every((clave) => future.params[clave] === current.params[clave])
    );
  }
}
