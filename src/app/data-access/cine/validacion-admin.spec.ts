/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Validacion Admin; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { errorInicioFuncion } from './validacion-admin';

describe('Inicio de función válido y estrictamente futuro', () => {
  const ahora = new Date('2030-01-10T20:00:00-03:00').getTime();
  for (const inicio of [
    '',
    'ayer',
    '2030-02-30T20:00',
    '2030-13-01T20:00',
    '2030-01-10T24:00',
    '2030-01-10T20:60',
    '2030-01-10T20:00:60',
    '2030-01-10',
    '2030-01-10T20:00Z',
    '2030-01-10T20:00:00.1234',
  ]) {
    it(`rechaza la fecha vacía o inválida ${JSON.stringify(inicio)}`, () => {
      expect(errorInicioFuncion(inicio, ahora)).not.toBe('');
    });
  }
  for (const inicio of ['2030-01-09T23:59', '2030-01-10T19:59', '2030-01-10T20:00']) {
    it(`rechaza el pasado y la igualdad: ${inicio}`, () => {
      expect(errorInicioFuncion(inicio, ahora)).toContain('futuras');
    });
  }
  for (const inicio of [
    '2030-01-10T20:01',
    '2030-01-10T20:00:01',
    '2030-01-10T20:00:00.001',
    '2032-02-29T20:00',
  ]) {
    it(`acepta el futuro sin normalizar fechas inexistentes: ${inicio}`, () => {
      expect(errorInicioFuncion(inicio, ahora)).toBe('');
    });
  }
  it('revalida el reloj al enviar y no usa la hora de apertura del formulario', () => {
    const inicio = '2030-01-10T20:01';
    expect(errorInicioFuncion(inicio, ahora)).toBe('');
    expect(errorInicioFuncion(inicio, ahora + 60000)).toContain('futuras');
  });
});
