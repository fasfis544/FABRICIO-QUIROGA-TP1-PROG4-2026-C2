/**
 * Anotacion de responsabilidad: Servicio Angular de Cliente; concentra la responsabilidad de este modulo dentro de app/data-access/perfiles. Incluye principalmente: ReservaCliente, leerReserva, r, e.
 */
import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, numero, objeto, texto } from '../cine/validacion';
import { estadoReserva, EstadoReserva, Funcion } from '../cine/operaciones.service';
import { CandyItem, leerCandy } from '../cine/checkout.service';
import { DatosPersonales } from './perfil.model';
export interface ReservaCliente {
  poster_url?: string;
  calificacion_propia?: number | null;
  texto_propio?: string | null;
  resena_por_pelicula?: boolean;
  qr_compra: string;
  pago_simulado: boolean;
  documento_pdf: string | null;
  token: string;
  estado: EstadoReserva;
  total: number;
  vence: string;
  creada: string;
  sala: string;
  pelicula: { id: string; titulo: string; clasificacion: string };
  funcion: Funcion;
  subtotal: number;
  descuento: number;
  credito: number;
  a_pagar: number;
  candy: CandyItem[];
  candy_codigo: string;
  candy_usada_en: string | null;
  entradas: { butaca: string; codigo: string; usada_en: string | null }[];
}
export function leerReserva(value: unknown): ReservaCliente {
  const r = objeto(value),
    p = objeto(r['pelicula']),
    f = objeto(r['funcion']);
  return {
    resena_por_pelicula: r['resena_por_pelicula'] === true,
    poster_url:
      typeof r['poster_url'] === 'string' && r['poster_url']
        ? r['poster_url']
        : '/images/afiche-respaldo.svg',
    calificacion_propia:
      typeof r['calificacion_propia'] === 'number' ? r['calificacion_propia'] : null,
    texto_propio:
      typeof r['texto_propio'] === 'string'
        ? r['texto_propio']
        : r['texto_propio'] === null
          ? null
          : undefined,
    qr_compra: texto(r, 'qr_compra'),
    pago_simulado: r['pago_simulado'] === true,
    documento_pdf: typeof r['documento_pdf'] === 'string' ? r['documento_pdf'] : null,
    token: texto(r, 'token'),
    estado: estadoReserva(texto(r, 'estado')),
    total: numero(r, 'total'),
    vence: texto(r, 'vence'),
    creada: texto(r, 'creada'),
    sala: texto(r, 'sala'),
    subtotal: numero(r, 'subtotal'),
    descuento: numero(r, 'descuento'),
    credito: numero(r, 'credito'),
    a_pagar: numero(r, 'a_pagar'),
    candy: leerCandy(r['candy']),
    candy_codigo: texto(r, 'candy_codigo'),
    candy_usada_en: typeof r['candy_usada_en'] === 'string' ? r['candy_usada_en'] : null,
    pelicula: {
      id: texto(p, 'id'),
      titulo: texto(p, 'titulo'),
      clasificacion: texto(p, 'clasificacion'),
    },
    funcion: {
      id: texto(f, 'id'),
      pelicula_id: texto(f, 'pelicula_id'),
      sala_id: texto(f, 'sala_id'),
      inicio: texto(f, 'inicio'),
      fin: texto(f, 'fin'),
      precio: numero(f, 'precio'),
      activa: f['activa'] === true,
      idioma: typeof f['idioma'] === 'string' ? f['idioma'] : 'Español',
      formato: typeof f['formato'] === 'string' ? f['formato'] : '2D',
    },
    entradas: lista(r['entradas']).map((x) => {
      const e = objeto(x);
      return {
        butaca: texto(e, 'butaca'),
        codigo: texto(e, 'codigo'),
        usada_en: typeof e['usada_en'] === 'string' ? e['usada_en'] : null,
      };
    }),
  };
}
@Service()
export class ClienteService {
  private readonly client = inject(SupabaseService).getClient();
  private async rpc(nombre: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await this.client.rpc(nombre, params);
    if (error) throw new Error(error.message);
    return data;
  }
  async editar(nombre: string, apellido: string): Promise<void> {
    await this.rpc('cine_editar_mi_perfil', { p_nombre: nombre, p_apellido: apellido });
  }
  async completar(datos: DatosPersonales): Promise<void> {
    // Explicit whitelist: never forward identity, access or economic fields.
    const { nombre, apellido, fecha_nacimiento, grupo_sanguineo, color_ojos, vacaciones_anuales } =
      datos;
    await this.rpc('cine_completar_perfil', {
      p_datos: {
        nombre,
        apellido,
        fecha_nacimiento,
        grupo_sanguineo,
        color_ojos,
        vacaciones_anuales,
      },
    });
  }
  async reservas(): Promise<ReservaCliente[]> {
    return lista(await this.rpc('cine_mis_reservas')).map(leerReserva);
  }
  async reserva(token: string): Promise<ReservaCliente> {
    return leerReserva(await this.rpc('cine_mi_reserva', { p_token: token }));
  }
  async comprobante(token: string): Promise<ReservaCliente> {
    return leerReserva(await this.rpc('cine_detalle_reserva', { p_token: token }));
  }
}
