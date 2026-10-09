/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Exportaciones; concentra la responsabilidad de este modulo dentro de app/shared/reportes. Incluye principalmente: Celda, HojaExcel, encoder, xml.
 */
export type Celda = string | number;
export interface HojaExcel {
  nombre: string;
  filas: readonly (readonly Celda[])[];
}
const encoder = new TextEncoder();
const xml = (v: string) =>
  v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name),
      data = encoder.encode(content),
      crc = crc32(data);
    const header = new Uint8Array(30 + filename.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, filename.length, true);
    header.set(filename, 30);
    const entry = new Uint8Array(46 + filename.length),
      e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x0800, true);
    e.setUint16(14, 33, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, data.length, true);
    e.setUint32(24, data.length, true);
    e.setUint16(28, filename.length, true);
    e.setUint32(42, offset, true);
    entry.set(filename, 46);
    parts.push(header, data);
    central.push(entry);
    offset += header.length + data.length;
  }
  const centralSize = central.reduce((sum, p) => sum + p.length, 0),
    end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, central.length, true);
  v.setUint16(10, central.length, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let start = 0;
  for (const part of [...parts, ...central, end]) {
    result.set(part, start);
    start += part.length;
  }
  return result;
}
function columna(index: number): string {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}

/** XLSX OOXML real (ZIP sin compresión). Los textos siempre son inlineStr, nunca fórmulas. */
export function crearExcel(hojas: readonly HojaExcel[]): Uint8Array<ArrayBuffer> {
  if (!hojas.length || hojas.length > 20) throw new Error('Cantidad de hojas inválida.');
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const files: Record<string, string> = {
    '[Content_Types].xml':
      declaration +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      hojas
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
    '_rels/.rels':
      declaration +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      declaration +
      `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      hojas
        .map((s, i) => `<sheet name="${xml(s.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      declaration +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      hojas
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      '</Relationships>',
  };
  const names = new Set<string>();
  hojas.forEach((s, i) => {
    if (
      !s.nombre ||
      s.nombre.length > 31 ||
      /[\\/?*\[\]:]/.test(s.nombre) ||
      names.has(s.nombre.toLowerCase())
    )
      throw new Error('Nombre de hoja inválido.');
    names.add(s.nombre.toLowerCase());
    files[`xl/worksheets/sheet${i + 1}.xml`] =
      declaration +
      `<worksheet xmlns="${ns}"><sheetData>` +
      s.filas
        .map(
          (row, r) =>
            `<row r="${r + 1}">` +
            row
              .map((value, c) => {
                const ref = columna(c) + (r + 1);
                return typeof value === 'number' && Number.isFinite(value)
                  ? `<c r="${ref}"><v>${value}</v></c>`
                  : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
              })
              .join('') +
            '</row>',
        )
        .join('') +
      '</sheetData></worksheet>';
  });
  return zip(files);
}
export function descargarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportarPdf(
  titulo: string,
  contexto: readonly string[],
  columnas: readonly string[],
  filas: readonly (readonly Celda[])[],
  nombre: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf'),
    pdf = new jsPDF();
  let y = 18;
  pdf.setFontSize(15);
  pdf.text(titulo, 14, y);
  y += 10;
  pdf.setFontSize(10);
  const linea = (text: string) => {
    const lines = pdf.splitTextToSize(text, 180) as string[];
    for (const line of lines) {
      if (y > 278) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(line, 14, y);
      y += 6;
    }
  };
  contexto.forEach(linea);
  linea(columnas.join(' | '));
  filas.forEach((row) => linea(row.join(' | ')));
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.text(`Página ${p}/${pages}`, 165, 290);
  }
  pdf.save(nombre);
}
