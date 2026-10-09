/**
 * Anotacion de responsabilidad: Servicio Angular de Perfiles; concentra la responsabilidad de este modulo dentro de app/data-access/perfiles. Incluye principalmente: PerfilesService, perfil, campos.
 */
import { inject, Service } from '@angular/core';
import { esRol } from '../../core/auth/rol.model';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Perfil } from './perfil.model';

@Service()
export class PerfilesService {
  private readonly client = inject(SupabaseService).getClient();

  async obtenerPerfil(id: string): Promise<Perfil> {
    const { data, error } = await this.client
      .from('perfiles')
      .select(
        'id,nombre,apellido,rol,activo,fecha_nacimiento,grupo_sanguineo,color_ojos,vacaciones_anuales',
      )
      .eq('id', id)
      .maybeSingle();
    if (error)
      throw new Error('No pudimos consultar tu perfil. Revisá tu conexión e intentá nuevamente.');
    if (!data)
      throw new Error('Tu cuenta no tiene un perfil disponible. Contactá al administrador.');
    const perfil: unknown = data;
    if (
      typeof perfil !== 'object' ||
      perfil === null ||
      !('id' in perfil) ||
      perfil.id !== id ||
      !('rol' in perfil) ||
      !esRol(perfil.rol) ||
      !('activo' in perfil) ||
      typeof perfil.activo !== 'boolean' ||
      !('nombre' in perfil) ||
      (perfil.nombre !== null && typeof perfil.nombre !== 'string') ||
      !('apellido' in perfil) ||
      (perfil.apellido !== null && typeof perfil.apellido !== 'string')
    ) {
      throw new Error('El perfil de tu cuenta no es válido. Contactá al administrador.');
    }
    const campos = perfil as Record<string, unknown>;
    return {
      id,
      nombre: perfil.nombre,
      apellido: perfil.apellido,
      rol: perfil.rol,
      activo: perfil.activo,
      fecha_nacimiento:
        typeof campos['fecha_nacimiento'] === 'string' ? campos['fecha_nacimiento'] : null,
      grupo_sanguineo:
        typeof campos['grupo_sanguineo'] === 'string' ? campos['grupo_sanguineo'] : null,
      color_ojos: typeof campos['color_ojos'] === 'string' ? campos['color_ojos'] : null,
      vacaciones_anuales:
        typeof campos['vacaciones_anuales'] === 'number' ? campos['vacaciones_anuales'] : null,
    };
  }
}
