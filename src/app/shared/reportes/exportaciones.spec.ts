/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Exportaciones; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { crearExcel } from './exportaciones';
import { errorRango, fechasProgramacion } from '../../data-access/cine/validacion-admin';

function archivosZip(bytes: Uint8Array): Map<string, string> {
  const files = new Map<string, string>(),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    decoder = new TextDecoder();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true),
      nameLength = view.getUint16(at + 26, true),
      extra = view.getUint16(at + 28, true),
      start = at + 30 + nameLength + extra;
    files.set(
      decoder.decode(bytes.slice(at + 30, at + 30 + nameLength)),
      decoder.decode(bytes.slice(start, start + size)),
    );
    at = start + size;
  }
  expect(view.getUint32(at, true)).toBe(0x02014b50);
  return files;
}
describe('Reportes y programación', () => {
  it('genera un XLSX real con relaciones, números y texto que no ejecuta fórmulas', () => {
    const files = archivosZip(
      crearExcel([
        {
          nombre: 'Detalle',
          filas: [
            ['Producto', 'Unidades'],
            ['=HYPERLINK("bad")', 2],
            ['Pochoclos & bebida', 3],
          ],
        },
      ]),
    );
    expect(files.has('[Content_Types].xml')).toBe(true);
    expect(files.get('xl/workbook.xml')).toContain('name="Detalle"');
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<v>2</v>');
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('Pochoclos &amp; bebida');
  });
  it('rechaza hojas inválidas o duplicadas', () => {
    expect(() => crearExcel([])).toThrow();
    expect(() => crearExcel([{ nombre: 'Mala/hoja', filas: [] }])).toThrow();
    expect(() =>
      crearExcel([
        { nombre: 'Ventas', filas: [] },
        { nombre: 'ventas', filas: [] },
      ]),
    ).toThrow();
  });
  it('incluye extremos y días elegidos con máximo de 90 días', () => {
    expect(fechasProgramacion('2030-01-01', '2030-01-07', [2, 4])).toEqual([
      '2030-01-01',
      '2030-01-03',
    ]);
    expect(fechasProgramacion('2030-01-07', '2030-01-01', [1])).toEqual([]);
    expect(fechasProgramacion('2030-01-01', '2030-04-01', [1])).toEqual([]);
    expect(fechasProgramacion('2030-02-30', '2030-03-03', [1, 2, 3, 4, 5, 6, 7])).toEqual([]);
  });
  it('valida fechas obligatorias e invertidas', () => {
    expect(errorRango('', '')).toContain('ambas');
    expect(errorRango('2030-01-02', '2030-01-01')).toContain('posterior');
    expect(errorRango('2030-01-01', '2030-01-02')).toBe('');
  });
});
