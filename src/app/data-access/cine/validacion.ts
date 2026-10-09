/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Validacion; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: objeto, lista, texto, numero.
 */
export function objeto(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Respuesta del servidor inválida.');
  return value as Record<string, unknown>;
}
export function lista(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Respuesta del servidor inválida.');
  return value;
}
export function texto(r: Record<string, unknown>, key: string): string {
  if (typeof r[key] !== 'string') throw new Error('Respuesta del servidor inválida.');
  return r[key];
}
export function numero(r: Record<string, unknown>, key: string): number {
  const value = r[key];
  const n =
    typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new Error('Respuesta del servidor inválida.');
  return n;
}
export function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : 'No pudimos completar la operación.';
}
