/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Fecha Argentina; concentra la responsabilidad de este modulo dentro de app/shared/cine. Incluye principalmente: fechaArgentina, fechaHoraArgentina, fecha, partes.
 */
/** Día del establecimiento: independiente del huso horario del dispositivo. */
export function fechaArgentina(fecha = new Date()): string {
  return fecha.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/** Valor para datetime-local del establecimiento, nunca de la zona del dispositivo. */
export function fechaHoraArgentina(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor;
  if (!Number.isFinite(fecha.getTime())) return '';
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}T${parte('hour')}:${parte('minute')}`;
}

/** Convierte hora civil Argentina (UTC−03 actual) a un instante validado. */
export function instanteArgentina(valor: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(valor);
  if (!m) throw new Error('Ingresá una fecha y hora válidas (Argentina).');
  const fecha = new Date(`${valor}-03:00`);
  const civil = new Date(fecha.getTime() - 3 * 3600000);
  if (
    !Number.isFinite(fecha.getTime()) ||
    civil.getUTCFullYear() !== Number(m[1]) ||
    civil.getUTCMonth() + 1 !== Number(m[2]) ||
    civil.getUTCDate() !== Number(m[3]) ||
    civil.getUTCHours() !== Number(m[4]) ||
    civil.getUTCMinutes() !== Number(m[5]) ||
    civil.getUTCSeconds() !== Number(m[6] ?? 0) ||
    civil.getUTCMilliseconds() !== Number((m[7] ?? '').padEnd(3, '0'))
  )
    throw new Error('Ingresá una fecha y hora válidas (Argentina).');
  return fecha.toISOString();
}
