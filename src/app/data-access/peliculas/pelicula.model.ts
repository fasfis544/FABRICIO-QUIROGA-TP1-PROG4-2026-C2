/**
 * Anotacion de responsabilidad: Modelos, tipos y reglas compartidas de Pelicula.Model; concentra la responsabilidad de este modulo dentro de app/data-access/peliculas. Incluye principalmente: Pelicula.
 */
export interface Pelicula {
  modalidades?: { idioma: string; formato: string }[];
  precio_preventa?: number | null;
  formatos?: string[];
  idiomas?: string[];
  ventas?: number;
  id: string;
  titulo: string;
  slug: string;
  sinopsis: string;
  duracion_minutos: number;
  clasificacion: string;
  fecha_estreno: string;
  poster_url: string;
  activa: boolean;
  generos: { id: string; nombre: string }[];
  idioma?: string;
  formato?: string;
}
