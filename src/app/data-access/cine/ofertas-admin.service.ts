/**
 * Anotacion de responsabilidad: Servicio Angular de Ofertas Admin; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: TipoOferta, OfertaAdmin, OfertasAdminService, r.
 */
import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, objeto, texto } from './validacion';
import { errorAdmin } from './errores-admin';
import { cambiarEstadoCatalogo } from './estado-catalogo';
export type TipoOferta = 'producto' | 'combo' | 'cupon' | 'recompensa';
export interface OfertaAdmin {
  id: string;
  nombre: string;
  datos: Record<string, unknown>;
}
@Service()
export class OfertasAdminService {
  cambiarEstado(tipo: TipoOferta, id: string, activo: boolean): Promise<void> {
    return cambiarEstadoCatalogo(this.client, tipo, id, activo);
  }
  async bienvenidaActual(): Promise<number> {
    const { data, error } = await this.client.rpc('cine_bienvenida_porcentaje');
    if (error || typeof data !== 'number')
      throw new Error('No se pudo consultar el porcentaje de bienvenida.');
    return data;
  }
  async bienvenida(porcentaje: number): Promise<void> {
    const { error } = await this.client.rpc('cine_configurar_bienvenida', {
      p_porcentaje: porcentaje,
    });
    if (error) throw errorAdmin(error);
  }
  private readonly client = inject(SupabaseService).getClient();
  async listar(): Promise<Record<TipoOferta, OfertaAdmin[]>> {
    const { data, error } = await this.client.rpc('cine_ofertas_admin');
    if (error) throw errorAdmin(error);
    const r = objeto(data);
    const leer = (key: string) =>
      lista(r[key]).map((x) => {
        const d = objeto(x);
        return {
          id: texto(d, 'id'),
          nombre: texto(d, key === 'cupones' ? 'codigo' : 'nombre'),
          datos: d,
        };
      });
    return {
      producto: leer('productos'),
      combo: leer('combos'),
      cupon: leer('cupones'),
      recompensa: leer('recompensas'),
    };
  }
  async guardar(tipo: TipoOferta, datos: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.rpc('cine_guardar_oferta', {
      p_tipo: tipo,
      p_datos: datos,
    });
    if (error) throw errorAdmin(error);
  }
}
