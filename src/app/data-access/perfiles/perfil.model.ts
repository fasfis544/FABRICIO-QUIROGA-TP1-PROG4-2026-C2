/**
 * Anotacion de responsabilidad: Modelos, tipos y reglas compartidas de Perfil.Model; concentra la responsabilidad de este modulo dentro de app/data-access/perfiles. Incluye principalmente: Perfil, DatosPersonales.
 */
import { Rol } from '../../core/auth/rol.model';

export interface Perfil {
  fecha_nacimiento?: string | null;
  grupo_sanguineo?: string | null;
  color_ojos?: string | null;
  vacaciones_anuales?: number | null;
  id: string;
  nombre: string | null;
  apellido: string | null;
  rol: Rol;
  activo: boolean;
}

export interface DatosPersonales {
  nombre: string;
  apellido: string;
  fecha_nacimiento: string;
  grupo_sanguineo: string;
  color_ojos: string;
  vacaciones_anuales: number;
}
