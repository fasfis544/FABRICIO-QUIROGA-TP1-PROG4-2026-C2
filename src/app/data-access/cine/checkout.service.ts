/**
 * Anotacion de responsabilidad: Servicio Angular de Checkout; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: CandySeleccion, CandyItem, CandyOferta, Cotizacion.
 */
import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, numero, objeto, texto } from './validacion';
import { ImagenesProductosService } from './imagenes-productos.service';
export interface CandySeleccion {
  tipo: 'producto' | 'combo';
  id: string;
  cantidad: number;
}
export interface CandyItem {
  nombre: string;
  cantidad: number;
  precio: number;
  items: { nombre: string; cantidad: number }[];
}
export interface CandyOferta {
  imagen_url?: string;
  categoria: string;
  incluye_entrada: boolean;
  id: string;
  nombre: string;
  precio: number;
  stock: number | null;
  tipo: 'producto' | 'combo';
  items: { nombre: string; cantidad: number }[];
}
export interface Cotizacion {
  entradas?: { butaca: string; tipo: string; precio: number }[];
  subtotal: number;
  descuento: number;
  total: number;
  credito: number;
  a_pagar: number;
  candy: CandyItem[];
}
export interface PedidoCheckout {
  funcion: string;
  butacas: string[];
  candy: CandySeleccion[];
  cupon: string;
  credito: number;
}
export function leerCandy(value: unknown): CandyItem[] {
  return lista(value).map((x) => {
    const r = objeto(x);
    return {
      nombre: texto(r, 'nombre'),
      cantidad: numero(r, 'cantidad'),
      precio: numero(r, 'precio'),
      items:
        r['items'] === undefined
          ? []
          : lista(r['items']).map((i) => {
              const t = objeto(i);
              return { nombre: texto(t, 'nombre'), cantidad: numero(t, 'cantidad') };
            }),
    };
  });
}
export function leerCotizacion(value: unknown): Cotizacion {
  const r = objeto(value);
  return {
    subtotal: numero(r, 'subtotal'),
    descuento: numero(r, 'descuento'),
    total: numero(r, 'total'),
    credito: numero(r, 'credito'),
    a_pagar: numero(r, 'a_pagar'),
    candy: leerCandy(r['candy']),
    entradas: lista(r['entradas'] ?? []).map((x) => {
      const e = objeto(x);
      return { butaca: texto(e, 'butaca'), tipo: texto(e, 'tipo'), precio: numero(e, 'precio') };
    }),
  };
}
@Service()
export class CheckoutService {
  private readonly imagenes = inject(ImagenesProductosService);
  private readonly client = inject(SupabaseService).getClient();
  private async rpc(nombre: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await this.client.rpc(nombre, params);
    if (error) throw new Error(error.message);
    return data;
  }
  private parametros(p: PedidoCheckout): Record<string, unknown> {
    return {
      p_funcion: p.funcion,
      p_butacas: p.butacas,
      p_candy: p.candy,
      p_cupon: p.cupon,
      p_credito: p.credito,
    };
  }
  async catalogo(): Promise<CandyOferta[]> {
    const r = objeto(await this.rpc('cine_candy_catalogo'));
    return (['productos', 'combos'] as const).flatMap((tipo) =>
      lista(r[tipo]).map((x) => {
        const v = objeto(x);
        return {
          id: texto(v, 'id'),
          imagen_url: tipo === 'productos' ? this.imagenes.url(v['imagen_path']) : '',
          nombre: texto(v, 'nombre'),
          categoria: typeof v['categoria'] === 'string' ? v['categoria'] : 'Combos',
          incluye_entrada: v['incluye_entrada'] === true,
          precio: numero(v, 'precio'),
          stock: tipo === 'productos' ? numero(v, 'stock') : null,
          tipo: tipo === 'productos' ? ('producto' as const) : ('combo' as const),
          items:
            tipo === 'productos'
              ? []
              : lista(v['items']).map((x) => {
                  const i = objeto(x);
                  return { nombre: texto(i, 'nombre'), cantidad: numero(i, 'cantidad') };
                }),
        };
      }),
    );
  }
  async cotizar(p: PedidoCheckout): Promise<Cotizacion> {
    return leerCotizacion(await this.rpc('cine_cotizar', this.parametros(p)));
  }
  async reservar(
    p: PedidoCheckout,
    comprador: { nombre: string; email: string; edad: boolean },
    solicitud: string,
    totalEsperado: number,
  ): Promise<string> {
    const { data, error } = await this.client.functions.invoke('confirmar-compra', {
      body: {
        ...p,
        ...comprador,
        solicitud,
        total_esperado: totalEsperado,
        pago_simulado: true,
      },
    });
    if (error) {
      const response: unknown = 'context' in error ? error.context : null;
      if (response instanceof Response) {
        const body: unknown = await response.json().catch(() => null);
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
          throw new Error(body.error);
      }
      throw new Error(
        'No se pudo confirmar. Verificá la conexión y el despliegue de confirmar-compra; reintentá sin cambiar el pedido.',
      );
    }
    const token = objeto(data)['token'];
    if (typeof token !== 'string') throw new Error('Respuesta del servidor inválida.');
    return token;
  }
}
