/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Filtros Modalidad; concentra la responsabilidad de este modulo dentro de app/data-access/peliculas. Incluye principalmente: coincideModalidad.
 */
import { Pelicula } from './pelicula.model';

export function coincideModalidad(pelicula: Pelicula, idioma: string, formato: string): boolean {
  if (!idioma && !formato) return true;
  if (pelicula.modalidades?.length)
    return pelicula.modalidades.some(
      (m) => (!idioma || m.idioma === idioma) && (!formato || m.formato === formato),
    );

  // Una película sin funciones futuras todavía se filtra por la modalidad de su ficha.
  if (idioma && pelicula.idioma !== idioma) return false;
  if (formato && pelicula.formato !== formato) return false;
  return true;
}
