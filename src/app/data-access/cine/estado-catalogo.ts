/**
 * Anotacion de responsabilidad: Modelos, tipos y reglas compartidas de Estado Catalogo; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: TipoCatalogo, cambiarEstadoCatalogo, coincideCatalogo.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { errorAdmin } from './errores-admin';

export type TipoCatalogo =
  'pelicula' | 'sala' | 'genero' | 'producto' | 'combo' | 'cupon' | 'recompensa';

export async function cambiarEstadoCatalogo(
  client: SupabaseClient,
  tipo: TipoCatalogo,
  id: string,
  activo: boolean,
): Promise<void> {
  const { error } = await client.rpc('cine_estado_catalogo', {
    p_tipo: tipo,
    p_id: id,
    p_activo: activo,
  });
  if (error?.code === 'PGRST202')
    throw new Error(
      'La baja y restauración requieren activar la migración de catálogo en Supabase. No se cambió el registro.',
    );
  if (error) throw errorAdmin(error);
}

export function coincideCatalogo(
  nombre: string,
  activo: boolean,
  busqueda: string,
  estado: string,
): boolean {
  return (
    nombre.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')) &&
    (!estado || activo === (estado === 'activo'))
  );
}
