/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Errores Admin; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: errorAdmin.
 */
export function errorAdmin(error: { code?: string; message: string }): Error {
  if (error.code === '23505')
    return new Error(
      'Ya existe un registro con ese nombre, código o slug. Elegí otro o editá el existente.',
    );
  if (error.code === '23514' || error.code === '22P02')
    return new Error(
      'Revisá los valores ingresados: hay un dato inválido o fuera del rango permitido.',
    );
  return new Error(error.message);
}
