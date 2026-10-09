/**
 * Anotacion de responsabilidad: Servicio Angular de Operaciones; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: Sala, Funcion, Disponibilidad, ButacaAdministracion.
 */
import { inject, Service } from '@angular/core';
import { cambiarEstadoCatalogo } from './estado-catalogo';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, numero, objeto, texto } from './validacion';
import { Butaca } from '../../shared/cine/reglas';

export interface Sala {
  distribucion_documento?: boolean;
  id: string;
  nombre: string;
  filas: number;
  columnas: number;
  activa: boolean;
}
export interface Funcion {
  vip_porcentaje?: number;
  idioma?: string;
  formato?: string;
  id: string;
  pelicula_id: string;
  sala_id: string;
  inicio: string;
  fin: string;
  precio: number;
  activa: boolean;
}
export interface Disponibilidad {
  bloqueadas?: string[];
  butacas: Butaca[];
  funcion: Funcion;
  sala: Sala;
  ocupadas: string[];
}
export interface ButacaAdministracion extends Omit<Butaca, 'precio'> {
  bloqueada: boolean;
  protegida: boolean;
  motivo: string;
}
export interface PlanoAdministracion {
  sala: Sala;
  butacas: ButacaAdministracion[];
}
export type EstadoReserva = 'pendiente' | 'confirmada' | 'vencida' | 'cancelada';
export type EstadoConexion = 'conectando' | 'conectada' | 'reconectando' | 'cerrada';
export function estadoReserva(value: string): EstadoReserva {
  if (
    value === 'pendiente' ||
    value === 'confirmada' ||
    value === 'vencida' ||
    value === 'cancelada'
  )
    return value;
  throw new Error('Estado de reserva inválido.');
}
export interface Comprobante {
  token: string;
  estado: EstadoReserva;
  total: number;
  vence: string;
  funcion: Funcion;
  entradas: { butaca: string; codigo: string; usada_en: string | null }[];
}
function sala(value: unknown): Sala {
  const r = objeto(value);
  return {
    id: texto(r, 'id'),
    nombre: texto(r, 'nombre'),
    filas: numero(r, 'filas'),
    columnas: numero(r, 'columnas'),
    activa: r['activa'] === true,
    distribucion_documento: r['distribucion_documento'] === true,
  };
}
function funcion(value: unknown): Funcion {
  const r = objeto(value);
  return {
    id: texto(r, 'id'),
    pelicula_id: texto(r, 'pelicula_id'),
    sala_id: texto(r, 'sala_id'),
    inicio: texto(r, 'inicio'),
    fin: texto(r, 'fin'),
    precio: numero(r, 'precio'),
    vip_porcentaje: typeof r['vip_porcentaje'] === 'number' ? r['vip_porcentaje'] : 25,
    idioma: typeof r['idioma'] === 'string' ? r['idioma'] : 'Español',
    formato: typeof r['formato'] === 'string' ? r['formato'] : '2D',
    activa: r['activa'] === true,
  };
}
@Service()
export class OperacionesService {
  cambiarEstadoSala(id: string, activa: boolean): Promise<void> {
    return cambiarEstadoCatalogo(this.client, 'sala', id, activa);
  }
  private readonly client = inject(SupabaseService).getClient();
  private async rpc(nombre: string, datos: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(nombre, datos);
    if (error) throw new Error(error.message);
    return data;
  }
  async salas(): Promise<Sala[]> {
    const { data, error } = await this.client.from('cine_salas').select('*').order('nombre');
    if (error) throw new Error('No pudimos cargar salas. Ejecutá el SQL de operación.');
    return lista(data).map(sala);
  }
  async funciones(pelicula?: string): Promise<Funcion[]> {
    let q = this.client
      .from('cine_funciones')
      .select('*')
      .gt('inicio', new Date().toISOString())
      .eq('activa', true)
      .order('inicio');
    if (pelicula) q = q.eq('pelicula_id', pelicula);
    const { data, error } = await q;
    if (error) throw new Error('No pudimos cargar funciones.');
    return lista(data).map(funcion);
  }
  async funcionesAdministracion(): Promise<Funcion[]> {
    const { data, error } = await this.client.from('cine_funciones').select('*').order('inicio');
    if (error) throw new Error('No se pudieron cargar las funciones administrativas.');
    return lista(data).map(funcion);
  }
  async funcionesOperativas(): Promise<Funcion[]> {
    const { data, error } = await this.client
      .from('cine_funciones')
      .select('*')
      .eq('activa', true)
      .gt('fin', new Date().toISOString())
      .order('inicio');
    if (error) throw new Error('No se pudieron cargar las funciones operativas.');
    return lista(data).map(funcion);
  }
  async crearSala(nombre: string, filas: number, columnas: number): Promise<void> {
    await this.rpc('cine_guardar_sala', { p_nombre: nombre, p_filas: filas, p_columnas: columnas });
  }
  async adaptarSala(id: string, nombre: string, activa: boolean): Promise<void> {
    await this.rpc('cine_adaptar_sala', { p_id: id, p_nombre: nombre, p_activa: activa });
  }
  async eliminarSalaDefinitivamente(id: string): Promise<void> {
    await this.rpc('cine_eliminar_sala_definitivamente', { p_id: id });
  }
  async planoAdministracion(id: string): Promise<PlanoAdministracion> {
    const r = objeto(await this.rpc('cine_butacas_admin', { p_sala: id }));
    return {
      sala: sala(r['sala']),
      butacas: lista(r['butacas']).map((value) => {
        const b = objeto(value);
        const tipo = texto(b, 'tipo');
        if (tipo !== 'normal' && tipo !== 'vip' && tipo !== 'accesible')
          throw new Error('Tipo de butaca inválido.');
        return {
          codigo: texto(b, 'codigo'),
          fila: texto(b, 'fila'),
          columna: numero(b, 'columna'),
          bloque: numero(b, 'bloque'),
          tipo,
          bloqueada: b['bloqueada'] === true,
          protegida: b['protegida'] === true,
          motivo: texto(b, 'motivo'),
        };
      }),
    };
  }
  async mantenerButacas(
    sala: string,
    codigos: string[],
    bloqueada: boolean,
    motivo: string,
  ): Promise<void> {
    await this.rpc('cine_mantener_butacas', {
      p_sala: sala,
      p_codigos: codigos,
      p_bloqueada: bloqueada,
      p_motivo: motivo.trim(),
    });
  }
  async configurarVip(id: string, porcentaje: number): Promise<void> {
    await this.rpc('cine_configurar_precios', { p_funcion: id, p_vip: porcentaje });
  }
  async editarFuncion(
    id: string,
    precio: number,
    idioma: string,
    formato: string,
    vip: number,
  ): Promise<void> {
    await this.rpc('cine_editar_funcion', {
      p_id: id,
      p_precio: precio,
      p_idioma: idioma,
      p_formato: formato,
      p_vip: vip,
    });
  }
  observar(id: string, cambio: () => void, estado?: (valor: EstadoConexion) => void): () => void {
    let activo = true;
    const notificar = () => {
      if (activo) cambio();
    };
    estado?.('conectando');
    const canal = this.client
      .channel(`publico-${id}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cine_eventos_publicos', filter: `id=eq.${id}` },
        notificar,
      )
      .subscribe((valor) => {
        if (activo)
          estado?.(
            valor === 'SUBSCRIBED' ? 'conectada' : valor === 'CLOSED' ? 'cerrada' : 'reconectando',
          );
      });
    const worker = globalThis.navigator?.serviceWorker;
    const actualizar = (event: MessageEvent<unknown>) => {
      const d = event.data;
      if (d && typeof d === 'object' && 'tipo' in d && d.tipo === 'cine-cartelera-actualizada')
        notificar();
    };
    if (id === 'cartelera') worker?.addEventListener('message', actualizar);
    return () => {
      activo = false;
      void this.client.removeChannel(canal);
      worker?.removeEventListener('message', actualizar);
    };
  }
  async crearFuncion(
    pelicula: string,
    inicio: string,
    precio: number,
    idioma?: string,
    formato?: string,
  ): Promise<void> {
    await this.rpc('cine_crear_funcion', {
      p_pelicula: pelicula,
      p_sala: null,
      p_inicio: inicio,
      p_precio: precio,
      ...(idioma ? { p_idioma: idioma } : {}),
      ...(formato ? { p_formato: formato } : {}),
    });
  }
  async disponibilidad(id: string): Promise<Disponibilidad> {
    const r = objeto(await this.rpc('cine_disponibilidad', { p_funcion: id }));
    return {
      funcion: funcion(r['funcion']),
      sala: sala(r['sala']),
      bloqueadas: lista(r['bloqueadas'] ?? []).map((codigo) => {
        if (typeof codigo !== 'string') throw new Error('Butaca bloqueada inválida.');
        return codigo;
      }),
      butacas: lista(r['butacas']).map((x) => {
        const b = objeto(x),
          tipo = texto(b, 'tipo');
        if (tipo !== 'normal' && tipo !== 'vip' && tipo !== 'accesible')
          throw new Error('Tipo de butaca inválido.');
        return {
          codigo: texto(b, 'codigo'),
          fila: texto(b, 'fila'),
          columna: numero(b, 'columna'),
          bloque: numero(b, 'bloque'),
          tipo,
          precio: numero(b, 'precio'),
        };
      }),
      ocupadas: lista(r['ocupadas']).map((x) => {
        if (typeof x !== 'string') throw new Error('Butaca inválida.');
        return x;
      }),
    };
  }
  async comprobante(token: string): Promise<Comprobante> {
    return this.leerComprobante(await this.rpc('cine_comprobante', { p_token: token }));
  }
  async confirmar(token: string): Promise<Comprobante> {
    return this.leerComprobante(await this.rpc('cine_confirmar_reserva', { p_token: token }));
  }
  async validar(codigo: string): Promise<string> {
    const r = objeto(await this.rpc('cine_validar_entrada', { p_codigo: codigo }));
    if (r['ok'] !== true) throw new Error(texto(r, 'mensaje'));
    return texto(r, 'mensaje') + ' · Butaca ' + texto(r, 'butaca');
  }
  private leerComprobante(value: unknown): Comprobante {
    const r = objeto(value);
    return {
      token: texto(r, 'token'),
      estado: estadoReserva(texto(r, 'estado')),
      total: numero(r, 'total'),
      vence: texto(r, 'vence'),
      funcion: funcion(r['funcion']),
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
}
