/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Reglas; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { FormControl } from '@angular/forms';
import { Butaca, butacasContiguas, edadEnFecha } from './reglas';
import { DuracionPipe, EdadPipe, PrecioArsPipe } from './pipes';
describe('Reglas trazables al documento', () => {
  const bs: Butaca[] = [1, 2, 3, 4, 5].map((n) => ({
    codigo: 'A' + n,
    fila: 'A',
    columna: n,
    bloque: n <= 4 ? 1 : 2,
    tipo: 'normal',
    precio: 1000,
  }));
  const validator = butacasContiguas(() => bs);
  for (const seleccion of [[], ['A1', 'A3'], ['A4', 'A5'], ['A1', 'A1'], ['Z1'], ['A1', 'B1']]) {
    it(`rechaza selección inválida ${seleccion.join(',')}`, () =>
      expect(validator(new FormControl(seleccion))).toEqual({ contiguas: true }));
  }
  it('acepta butacas contiguas en el mismo bloque', () =>
    expect(validator(new FormControl(['A2', 'A3']))).toBeNull());
  it('calcula edad exacta antes/en el cumpleaños', () => {
    expect(edadEnFecha('2008-10-08', new Date('2026-10-07T12:00:00-03:00'))).toBe(17);
    expect(edadEnFecha('2008-10-07', new Date('2026-10-07T12:00:00-03:00'))).toBe(18);
  });
  it('cumple años a medianoche Argentina, no a medianoche UTC/dispositivo', () => {
    const pipe = new EdadPipe();
    expect(pipe.transform('2008-10-09', '2026-10-08')).toBe(17);
    expect(pipe.transform('2008-10-09', '2026-10-09')).toBe(18);
    expect(edadEnFecha('2008-10-09', new Date('2026-10-09T02:59:59Z'))).toBe(17);
    expect(edadEnFecha('2008-10-09', new Date('2026-10-09T03:00:00Z'))).toBe(18);
    expect(edadEnFecha('2026-10-09', new Date('2026-10-09T02:59:59Z'))).toBeNull();
    expect(edadEnFecha('2008-02-29', new Date('2026-02-28T12:00:00-03:00'))).toBe(17);
    expect(edadEnFecha('2008-02-29', new Date('2026-03-01T12:00:00-03:00'))).toBe(18);
  });
  it('no trata una fecha faltante, inexistente o futura como adulto', () => {
    expect(edadEnFecha('2000-01-01', new Date('inválido'))).toBeNull();
    expect(edadEnFecha(null)).toBeNull();
    expect(edadEnFecha('2000-02-31')).toBeNull();
    expect(edadEnFecha('2099-01-01')).toBeNull();
  });
  it('aplica los tres pipes exigidos', () => {
    expect(new DuracionPipe().transform(125)).toBe('2 h 5 min');
    expect(new PrecioArsPipe().transform(1234.5)).toContain('1.234,50');
    expect(new EdadPipe().transform(null)).toBeNull();
  });
});
