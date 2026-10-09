/**
 * Anotacion de responsabilidad: Servicio Angular de Administracion; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: UsuarioAdmin, Programacion, FilaReporte, ReporteAdmin.
 */
import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, numero, objeto, texto } from './validacion';
import { errorAdmin } from './errores-admin';
import { Rol, esRol } from '../../core/auth/rol.model';

export interface UsuarioAdmin {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
  activo: boolean;
}
export interface Programacion {
  pelicula: string;
  desde: string;
  hasta: string;
  hora: string;
  dias: number[];
  precio: number;
  idioma: string;
  formato: string;
  solicitud: string;
}
export interface FilaReporte {
  nombre: string;
  cantidad: number;
  importe: number;
  vistas: number;
}
export interface ReporteAdmin {
  compras: number;
  entradas: number;
  total: number;
  credito: number;
  abonado: number;
  diarios: FilaReporte[];
  peliculas: FilaReporte[];
  candy: FilaReporte[];
}

@Service()
export class AdministracionService {
  private readonly client = inject(SupabaseService).getClient();
  private async rpc(nombre: string, datos: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(nombre, datos);
    if (error) throw errorAdmin(error);
    return data;
  }
  async cancelarFuncion(id: string, motivo: string): Promise<void> {
    await this.rpc('cine_cancelar_funcion', { p_id: id, p_motivo: motivo });
  }
  async reprogramarFuncion(id: string, inicio: string, motivo: string): Promise<void> {
    await this.rpc('cine_reprogramar_funcion', { p_id: id, p_inicio: inicio, p_motivo: motivo });
  }
  async programar(d: Programacion): Promise<string[]> {
    return lista(
      await this.rpc('cine_programar_funciones', {
        p_pelicula: d.pelicula,
        p_desde: d.desde,
        p_hasta: d.hasta,
        p_hora: d.hora,
        p_dias: d.dias,
        p_precio: d.precio,
        p_idioma: d.idioma,
        p_formato: d.formato,
        p_solicitud: d.solicitud,
      }),
    ).map((v) => {
      if (typeof v !== 'string') throw new Error('Respuesta de programación inválida.');
      return v;
    });
  }
  async usuarios(busqueda: string, offset: number): Promise<UsuarioAdmin[]> {
    return lista(
      await this.rpc('cine_usuarios_admin', { p_busqueda: busqueda, p_offset: offset }),
    ).map((v) => {
      const r = objeto(v),
        rol = r['rol'];
      if (!esRol(rol)) throw new Error('Rol de usuario inválido.');
      return {
        id: texto(r, 'id'),
        nombre: texto(r, 'nombre'),
        apellido: texto(r, 'apellido'),
        email: texto(r, 'email'),
        rol,
        activo: r['activo'] === true,
      };
    });
  }
  async guardarUsuario(id: string, rol: Rol, activo: boolean): Promise<void> {
    await this.rpc('cine_administrar_usuario', { p_id: id, p_rol: rol, p_activo: activo });
  }
  async reporte(desde: string, hasta: string): Promise<ReporteAdmin> {
    const r = objeto(await this.rpc('cine_reportes_admin', { p_desde: desde, p_hasta: hasta }));
    const filas = (key: string): FilaReporte[] =>
      lista(r[key]).map((v) => {
        const f = objeto(v);
        return {
          nombre: texto(f, 'nombre'),
          cantidad: numero(f, 'cantidad'),
          importe: numero(f, 'importe'),
          vistas: numero(f, 'vistas'),
        };
      });
    return {
      compras: numero(r, 'compras'),
      entradas: numero(r, 'entradas'),
      total: numero(r, 'total'),
      credito: numero(r, 'credito'),
      abonado: numero(r, 'abonado'),
      diarios: filas('diarios'),
      peliculas: filas('peliculas'),
      candy: filas('candy'),
    };
  }
}
