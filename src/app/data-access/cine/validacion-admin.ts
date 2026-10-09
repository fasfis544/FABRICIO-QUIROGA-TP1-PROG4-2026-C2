/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Validacion Admin; concentra la responsabilidad de este modulo dentro de app/data-access/cine. Incluye principalmente: errorInicioFuncion, errorRango, civil, fechasProgramacion.
 */
import { instanteArgentina } from '../../shared/cine/fecha-argentina';

export function errorInicioFuncion(inicio: string, ahora = Date.now()): string {
  if (!inicio) return 'Completá la fecha y hora de inicio.';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(inicio))
    return 'Ingresá una fecha y hora válidas.';
  try {
    return Date.parse(instanteArgentina(inicio)) > ahora
      ? ''
      : 'La fecha y hora de inicio deben ser futuras.';
  } catch {
    return 'Ingresá una fecha y hora válidas.';
  }
}

export function errorRango(desde: string, hasta: string): string {
  if (!desde || !hasta) return 'Completá ambas fechas.';
  try {
    const civil = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00' : v);
    return Date.parse(instanteArgentina(civil(hasta))) > Date.parse(instanteArgentina(civil(desde)))
      ? ''
      : 'Hasta debe ser posterior a Desde.';
  } catch {
    return 'Ingresá fechas válidas.';
  }
}
export function fechasProgramacion(
  desde: string,
  hasta: string,
  dias: readonly number[],
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return [];
  const start = Date.parse(desde + 'T00:00:00Z'),
    end = Date.parse(hasta + 'T00:00:00Z');
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 89 * 86400000
  )
    return [];
  if (
    new Date(start).toISOString().slice(0, 10) !== desde ||
    new Date(end).toISOString().slice(0, 10) !== hasta
  )
    return [];
  const result: string[] = [];
  for (let time = start; time <= end; time += 86400000) {
    const d = new Date(time);
    if (dias.includes(d.getUTCDay() || 7)) result.push(d.toISOString().slice(0, 10));
  }
  return result;
}
