/**
 * Extiende BaseRouteReuseStrategy y sobrescribe shouldReuseRoute para decidir si Angular conserva la instancia del componente.
Exige la misma configuración de ruta, igual cantidad de parámetros y valores coincidentes mediante every.
Si cambia el ID de película, función o compra, crea otra instancia para evitar datos anteriores; cambiar sólo query params permite reutilizarla.
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
