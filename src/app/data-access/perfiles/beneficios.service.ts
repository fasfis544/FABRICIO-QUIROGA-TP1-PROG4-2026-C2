/**
 * Anotacion de responsabilidad: Servicio Angular de Beneficios; concentra la responsabilidad de este modulo dentro de app/data-access/perfiles. Incluye principalmente: Movimiento, Recompensa, Canje, Notificacion.
 */
import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, numero, objeto, texto } from '../cine/validacion';
export interface Movimiento {
  id: string;
  tipo: string;
  importe: number;
  motivo: string;
  creada: string;
}
export interface Recompensa {
  tipo?: string;
  id: string;
  nombre: string;
  puntos: number;
  porcentaje: number;
  hasta: string;
}
export interface Canje {
  id: string;
  nombre: string;
  puntos: number;
  creada: string;
  codigo: string;
  hasta: string;
  usado: boolean;
}
export interface Notificacion {
  id: string;
  mensaje: string;
  creada: string;
  leida: boolean;
  destino?: string[];
  enlace?: string;
}
export function enlaceNotificacion(
  clave: unknown,
  mensaje: string,
): Pick<Notificacion, 'destino' | 'enlace'> {
  const venta =
    typeof clave === 'string'
      ? /^venta:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(clave)
      : null;
  if (venta) return { destino: ['/peliculas', venta[1]], enlace: 'Ver película y funciones' };
  if (/canje|cupón/i.test(mensaje))
    return { destino: ['/perfil/canjes'], enlace: 'Ver mis canjes' };
  if (/crédito|cancelad/i.test(mensaje))
    return { destino: ['/perfil/credito'], enlace: 'Consultar mi crédito' };
  return { destino: ['/perfil/compras'], enlace: 'Ver mis compras' };
}
export interface Beneficios {
  cupones?: { codigo: string; tipo: string; porcentaje: number; hasta: string }[];
  credito: number;
  credito_disponible: number;
  puntos: number;
  puntos_disponibles: number;
  movimientos: Movimiento[];
  recompensas: Recompensa[];
  canjes: Canje[];
  notificaciones: Notificacion[];
  alertas: { pelicula_id: string; titulo: string }[];
}
export interface Resena {
  id: string;
  nombre: string;
  calificacion: number;
  texto: string;
  creada: string;
}
export function leerBeneficios(value: unknown): Beneficios {
  const r = objeto(value);
  return {
    cupones: lista(r['cupones'] ?? []).map((x) => {
      const c = objeto(x);
      return {
        codigo: texto(c, 'codigo'),
        tipo: texto(c, 'tipo'),
        porcentaje: numero(c, 'porcentaje'),
        hasta: texto(c, 'hasta'),
      };
    }),
    credito: numero(r, 'credito'),
    credito_disponible: numero(r, 'credito_disponible'),
    puntos: numero(r, 'puntos'),
    puntos_disponibles: numero(r, 'puntos_disponibles'),
    movimientos: lista(r['movimientos']).map((x) => {
      const t = objeto(x);
      return {
        id: texto(t, 'id'),
        tipo: texto(t, 'tipo'),
        importe: numero(t, 'importe'),
        motivo: texto(t, 'motivo'),
        creada: texto(t, 'creada'),
      };
    }),
    recompensas: lista(r['recompensas']).map((x) => {
      const t = objeto(x);
      return {
        id: texto(t, 'id'),
        nombre: texto(t, 'nombre'),
        puntos: numero(t, 'puntos'),
        porcentaje: numero(t, 'porcentaje'),
        tipo: typeof t['tipo'] === 'string' ? t['tipo'] : 'legado',
        hasta: texto(t, 'hasta'),
      };
    }),
    canjes: lista(r['canjes']).map((x) => {
      const t = objeto(x);
      return {
        id: texto(t, 'id'),
        nombre: texto(t, 'nombre'),
        puntos: numero(t, 'puntos'),
        creada: texto(t, 'creada'),
        codigo: texto(t, 'codigo'),
        hasta: texto(t, 'hasta'),
        usado: t['usado'] === true,
      };
    }),
    notificaciones: lista(r['notificaciones']).map((x) => {
      const t = objeto(x);
      return {
        id: texto(t, 'id'),
        mensaje: texto(t, 'mensaje'),
        creada: texto(t, 'creada'),
        leida: t['leida'] === true,
        ...enlaceNotificacion(t['clave'], texto(t, 'mensaje')),
      };
    }),
    alertas: lista(r['alertas']).map((x) => {
      const t = objeto(x);
      return { pelicula_id: texto(t, 'pelicula_id'), titulo: texto(t, 'titulo') };
    }),
  };
}
@Service()
export class BeneficiosService {
  private readonly client = inject(SupabaseService).getClient();
  private async rpc(nombre: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await this.client.rpc(nombre, params);
    if (error) throw new Error(error.message);
    return data;
  }
  async obtener(): Promise<Beneficios> {
    return leerBeneficios(await this.rpc('cine_mis_beneficios'));
  }
  async cancelar(token: string): Promise<void> {
    await this.rpc('cine_cancelar', { p_token: token });
  }
  async canjear(id: string, solicitud: string): Promise<void> {
    await this.rpc('cine_canjear', { p_recompensa: id, p_solicitud: solicitud });
  }
  async leida(id: string): Promise<void> {
    await this.rpc('cine_marcar_leida', { p_id: id });
  }
  async alerta(pelicula: string, activa: boolean): Promise<void> {
    await this.rpc('cine_alerta', { p_pelicula: pelicula, p_activa: activa });
  }
  async resenar(token: string, calificacion: number, texto: string): Promise<void> {
    await this.rpc('cine_escribir_resena', {
      p_token: token,
      p_calificacion: calificacion,
      p_texto: texto,
    });
  }
  async resenas(pelicula: string): Promise<{ promedio: number; resenas: Resena[] }> {
    const r = objeto(await this.rpc('cine_resenas_publicas', { p_pelicula: pelicula }));
    return {
      promedio: numero(r, 'promedio'),
      resenas: lista(r['resenas']).map((x) => {
        const t = objeto(x);
        return {
          id: texto(t, 'id'),
          nombre: texto(t, 'nombre'),
          calificacion: numero(t, 'calificacion'),
          texto: texto(t, 'texto'),
          creada: texto(t, 'creada'),
        };
      }),
    };
  }
  async validar(
    codigo: string,
    tipo: string,
    funcion: string,
  ): Promise<{ mensaje: string; candy: string }> {
    const r = objeto(
      await this.rpc('cine_validar_compra', { p_codigo: codigo, p_tipo: tipo, p_funcion: funcion }),
    );
    if (r['ok'] !== true) throw new Error(texto(r, 'mensaje'));
    return {
      mensaje: texto(r, 'mensaje'),
      candy:
        r['candy'] === undefined
          ? ''
          : lista(r['candy'])
              .map((x) => {
                const t = objeto(x);
                return numero(t, 'cantidad') + ' × ' + texto(t, 'nombre');
              })
              .join(', '),
    };
  }
}
