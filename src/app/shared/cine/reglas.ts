/**
 * Anotacion de responsabilidad: Modelos, tipos y reglas compartidas de Reglas; concentra la responsabilidad de este modulo dentro de app/shared/cine. Incluye principalmente: edadEnFecha, fecha, diaHoy, Butaca.
 */
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { fechaArgentina } from './fecha-argentina';

export function edadEnFecha(
  nacimiento: string | null | undefined,
  hoy = new Date(),
): number | null {
  if (
    !nacimiento ||
    !/^\d{4}-\d{2}-\d{2}$/.test(nacimiento) ||
    !Number.isFinite(hoy.getTime())
  )
    return null;
  const [ano, mes, dia] = nacimiento.split('-').map(Number);
  const fecha = new Date(nacimiento + 'T00:00:00Z');
  const diaHoy = fechaArgentina(hoy);
  const [anoHoy, mesHoy, numeroHoy] = diaHoy.split('-').map(Number);
  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.getUTCFullYear() !== ano ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia ||
    nacimiento > diaHoy
  )
    return null;
  return (
    anoHoy -
    ano -
    (mesHoy < mes || (mesHoy === mes && numeroHoy < dia) ? 1 : 0)
  );
}
export interface Butaca {
  codigo: string;
  fila: string;
  columna: number;
  bloque: number;
  tipo: 'normal' | 'vip' | 'accesible';
  precio: number;
}
export function butacasContiguas(distribucion: () => Butaca[]): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const values: unknown = control.value;
    if (
      !Array.isArray(values) ||
      values.length < 1 ||
      values.length > 8 ||
      values.some((x) => typeof x !== 'string')
    )
      return { contiguas: true };
    const bs = values.map((codigo) => distribucion().find((b) => b.codigo === codigo));
    if (bs.some((b) => !b) || new Set(values).size !== values.length) return { contiguas: true };
    const validas = bs.filter((b): b is Butaca => b !== undefined);
    return new Set(validas.map((b) => b.fila)).size === 1 &&
      new Set(validas.map((b) => b.bloque)).size === 1 &&
      Math.max(...validas.map((b) => b.columna)) -
        Math.min(...validas.map((b) => b.columna)) +
        1 ===
        validas.length
      ? null
      : { contiguas: true };
  };
}
export const gruposSanguineos = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
