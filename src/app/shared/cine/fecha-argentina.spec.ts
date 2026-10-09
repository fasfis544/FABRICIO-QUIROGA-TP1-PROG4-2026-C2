/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Fecha Argentina; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { fechaHoraArgentina, instanteArgentina } from './fecha-argentina';
import { errorRango } from '../../data-access/cine/validacion-admin';
describe('Edición de instantes Argentina', () => {
  it('muestra medianoche sin cambiar de día por la zona del dispositivo', () => {
    expect(fechaHoraArgentina('2030-02-01T02:30:00Z')).toBe('2030-01-31T23:30');
    expect(fechaHoraArgentina('2030-02-01T03:00:00Z')).toBe('2030-02-01T00:00');
  });
  it('convierte y reabre sin modificar el instante civil', () => {
    const valor = '2030-01-31T23:30';
    expect(instanteArgentina(valor)).toBe('2030-02-01T02:30:00.000Z');
    expect(fechaHoraArgentina(instanteArgentina(valor))).toBe(valor);
  });
  for (const valor of [
    '2030-02-30T20:00',
    '2030-01-01T24:00',
    '2030-01-01',
    '',
    '2030-01-01T20:00Z',
  ]) {
    it(`rechaza fecha inexistente o zona explícita ${valor}`, () =>
      expect(() => instanteArgentina(valor)).toThrow());
  }
  it('acepta segundos y fracción en un día bisiesto', () => {
    expect(instanteArgentina('2032-02-29T20:00:01.1')).toBe('2032-02-29T23:00:01.100Z');
  });
  it('valida rangos sin normalizar fechas inválidas', () => {
    expect(errorRango('2030-02-30T20:00', '2030-03-02T20:00')).toContain('válidas');
    expect(errorRango('2030-01-31T23:30', '2030-02-01T00:00')).toBe('');
    expect(fechaHoraArgentina('inválida')).toBe('');
  });
});
