/**
 * Anotacion de responsabilidad: Servicio Angular de Peliculas; concentra la responsabilidad de este modulo dentro de app/data-access/peliculas. Incluye principalmente: GeneroPelicula, PeliculasService, r, slug.
 */
import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Pelicula } from './pelicula.model';
import { lista, objeto, texto, numero } from '../cine/validacion';
import { errorAdmin } from '../cine/errores-admin';
import { cambiarEstadoCatalogo } from '../cine/estado-catalogo';

export interface GeneroPelicula {
  id: string;
  nombre: string;
  activo: boolean;
}

function idiomaCanonico(value: unknown): string {
  if (typeof value !== 'string') return '';
  const idioma = value.trim().toLocaleLowerCase('es');
  return idioma === 'español' || idioma === 'espanol' ? 'castellano' : idioma;
}

function formatoCanonico(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

@Service()
export class PeliculasService {
  cambiarEstado(id: string, activa: boolean): Promise<void> {
    return cambiarEstadoCatalogo(this.client, 'pelicula', id, activa);
  }
  private readonly client = inject(SupabaseService).getClient();
  async listar(admin = false): Promise<Pelicula[]> {
    const { data, error } = admin
      ? await this.client.rpc('cine_catalogo', { p_admin: true })
      : await this.client.rpc('cine_cartelera', {}, { get: true });
    if (error)
      throw new Error('No pudimos cargar las películas. Verificá conexión y configuración SQL.');
    return lista(data).map((item) => {
      const r = objeto(item);
      const slug = texto(r, 'slug');
      const posters: Record<string, string> = {
        'plan-b': '/images/planB-peli1.png',
        'tia-en-mision': '/images/tia-en-mision-peli2.png',
        'el-ultimo-hilo': '/images/el-ultimo-hilo-peli3.png',
        'cenizas-del-manana': '/images/cenizas-del-mañana-peli4.png',
      };
      return {
        id: texto(r, 'id'),
        titulo: texto(r, 'titulo'),
        precio_preventa: typeof r['precio_preventa'] === 'number' ? r['precio_preventa'] : null,
        formatos: lista(r['formatos'] ?? [])
          .map(formatoCanonico)
          .filter(Boolean),
        idiomas: lista(r['idiomas'] ?? [])
          .map(idiomaCanonico)
          .filter(Boolean),
        ventas: typeof r['ventas'] === 'number' ? r['ventas'] : 0,
        modalidades: Array.isArray(r['modalidades'])
          ? lista(r['modalidades']).flatMap((value) => {
              if (!value || typeof value !== 'object') return [];
              const m = objeto(value);
              const idioma = idiomaCanonico(m['idioma']);
              const formato = formatoCanonico(m['formato']);
              return idioma && formato
                ? [{ idioma, formato }]
                : [];
            })
          : undefined,
        slug,
        sinopsis: typeof r['sinopsis'] === 'string' ? r['sinopsis'] : '',
        duracion_minutos: numero(r, 'duracion_minutos'),
        clasificacion: String(r['clasificacion']),
        fecha_estreno: texto(r, 'fecha_estreno'),
        activa: r['activa'] === true,
        idioma: idiomaCanonico(r['idioma']) || 'castellano',
        formato: formatoCanonico(r['formato']) || '2D',
        poster_url:
          typeof r['poster_url'] === 'string' && r['poster_url']
            ? r['poster_url']
            : (posters[slug] ?? '/images/afiche-respaldo.svg'),
        generos: lista(r['generos']).map((g) => {
          const v = objeto(g);
          return { id: texto(v, 'id'), nombre: texto(v, 'nombre') };
        }),
      };
    });
  }
  async guardar(datos: Partial<Pelicula>, generos: string[]): Promise<string> {
    const { data, error } = await this.client.rpc('cine_guardar_pelicula', {
      p_datos: datos,
      p_generos: generos,
    });
    if (error) throw errorAdmin(error);
    if (typeof data !== 'string' || !data)
      throw new Error(
        'No se recibió el identificador de la película. Actualizá el listado antes de reintentar.',
      );
    return data;
  }
  async generos(): Promise<GeneroPelicula[]> {
    const { data, error } = await this.client.from('generos').select('*').order('nombre');
    if (error) throw new Error('No pudimos consultar géneros.');
    return lista(data).map((g) => {
      const r = objeto(g);
      return {
        id: texto(r, 'id'),
        nombre: texto(r, 'nombre'),
        activo: (r['activo'] ?? r['activa']) === true,
      };
    });
  }
}
