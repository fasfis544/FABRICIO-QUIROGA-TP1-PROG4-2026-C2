/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Validacion; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { numero, objeto, lista, texto } from './validacion';
describe('Contrato de datos: no convertir ausencias en ceros', () => {
  for (const importe of ['', '   ', null, undefined, false, Infinity, NaN, 'NaN', [], {}]) {
    it(`rechaza importe inválido ${JSON.stringify(importe)}`, () =>
      expect(() => numero({ importe }, 'importe')).toThrow());
  }
  it('acepta cero y números PostgreSQL serializados', () => {
    expect(numero({ importe: 0 }, 'importe')).toBe(0);
    expect(numero({ importe: '123.45' }, 'importe')).toBe(123.45);
  });
  it('rechaza estructuras equivocadas sin inventar campos', () => {
    expect(() => objeto([])).toThrow();
    expect(() => lista({})).toThrow();
    expect(() => texto({ nombre: 1 }, 'nombre')).toThrow();
  });
});
