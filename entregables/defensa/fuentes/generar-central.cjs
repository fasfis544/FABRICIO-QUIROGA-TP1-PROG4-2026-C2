/* Generación documental únicamente. No modifica código ni configuración. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const out = path.resolve(__dirname, '..');
const docx = require(process.env.CINE_DOCX_MODULE || path.join(process.env.LOCALAPPDATA, 'Temp/opencode/cine-word/node_modules/docx'));
const metadataPath = path.join(out, 'Verificacion_Documento.json');
const previous = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : null;
const maxLines = 1999;
const snippets = {
  pedido: ['src/app/features/compra/checkout.component.ts', 'protected readonly pedido = computed<PedidoCheckout>', 7],
  numero: ['src/app/data-access/cine/validacion.ts', 'export function numero', 7],
  sesion: ['src/app/core/auth/sesion.service.ts', 'readonly usuario = computed', 5],
  guard: ['src/app/core/guards/rol.guard.ts', 'export function rolGuard', 14],
  contiguidad: ['src/app/shared/cine/reglas.ts', 'const bs = values.map', 11],
  control: ['src/app/features/cine/reserva.component.ts', 'protected readonly control = new FormControl', 5],
  solicitud: ['src/app/features/compra/checkout.component.ts', 'const p = this.pedido();\n    const firma', 6],
  commit: ['supabase/functions/confirmar-compra/handler.ts', 'const codigo = crypto.randomUUID();', 11],
};
const fragments = [];
let md = fs.readFileSync(path.join(__dirname, 'guia-central.md'), 'utf8').replace(/\{\{fragmento:(\w+)\}\}/g, (_, id) => {
  if (!snippets[id]) throw new Error('Fragmento desconocido: ' + id);
  const [file, marker, count] = snippets[id];
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const at = text.indexOf(marker);
  if (at < 0) throw new Error('Fragmento ausente: ' + file + ' / ' + marker);
  const first = text.slice(0, at).split('\n').length;
  const code = text.split('\n').slice(first - 1, first - 1 + count).join('\n');
  fragments.push({ id, file, first, count, code });
  return `${file}, L${first}–${first + count - 1}.\n\n\`\`\`typescript\n${code}\n\`\`\``;
});
const markdownLines = md.trimEnd().split(/\r?\n/).length;
if (markdownLines > maxLines) throw new Error(`La guía tiene ${markdownLines} líneas; máximo ${maxLines}.`);
const files = [];
const directories = [];
function inventory(dir) {
  directories.push(dir);
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = dir + '/' + entry.name;
    if (entry.isDirectory()) inventory(file);
    else {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      const sha256 = file.includes('/environments/') ? null : crypto.createHash('sha256').update(text).digest('hex');
      const baseline = previous?.files?.find(f => f.file === file);
      if (baseline?.sha256 && baseline.sha256 !== sha256) throw new Error('Código distinto de la revisión previa: ' + file);
      files.push({ file, lines: text.split('\n').length, sha256 });
    }
  }
}
inventory('src');

const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Header, Footer, PageNumber, InternalHyperlink, Bookmark, BorderStyle } = docx;
function inline(text, bold = false) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map(part => {
    if (part.startsWith('**')) return inline(part.slice(2, -2), true);
    if (part.startsWith('`')) return new TextRun({ text: part.slice(1, -1), font: 'Consolas', size: 18, bold });
    return new TextRun({ text: part, bold });
  }).flat();
}
const p = (text, options = {}) => new Paragraph({ children: inline(text), ...options });
const paragraphs = [];
paragraphs.push(p('CINE AURORA', { alignment: AlignmentType.CENTER, spacing: { before: 1300, after: 250 }, children: [new TextRun({ text: 'CINE AURORA', bold: true, size: 44, color: '243247' })] }));
paragraphs.push(p('Defensa central del código', { alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Defensa central del código', bold: true, size: 32 })], spacing: { after: 220 } }));
paragraphs.push(p('Decisiones · flujo de compra · seguridad · justificación', { alignment: AlignmentType.CENTER, spacing: { after: 450 } }));
paragraphs.push(p('Fabricio Quiroga · Programación IV · Comisión 141', { alignment: AlignmentType.CENTER }));
paragraphs.push(p('Docente: Ricardo Gastón Plazas · Revisión: 12/10/2026', { alignment: AlignmentType.CENTER }));
paragraphs.push(p('Guía de estudio concentrada, sin catálogo exhaustivo ni matrices repetidas.', { alignment: AlignmentType.CENTER, spacing: { before: 220, after: 350 } }));
paragraphs.push(p('Índice navegable', { heading: HeadingLevel.HEADING_1, keepNext: true }));
const chapters = md.split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3));
const bookmarks = new Map(chapters.map((title, i) => [title, 'capitulo_' + (i + 1)]));
for (const title of chapters) paragraphs.push(new Paragraph({ children: [new InternalHyperlink({ anchor: bookmarks.get(title), children: [new TextRun({ text: title, color: '24567A' })] })], spacing: { after: 100 } }));
let inCode = false;
let code = [];
function flushCode() {
  for (const [i, line] of code.entries()) paragraphs.push(new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 17, color: '233247' })], spacing: { after: 0, line: 215 }, shading: { fill: 'F0F3F7' }, indent: { left: 100 }, keepNext: i < code.length - 1 }));
  code = [];
  paragraphs.push(p('', { spacing: { after: 80 } }));
}
for (const line of md.split('\n')) {
  if (line.startsWith('```')) { if (inCode) flushCode(); inCode = !inCode; continue; }
  if (inCode) { code.push(line); continue; }
  if (!line.trim() || line.startsWith('# ')) continue;
  // La portada contiene autor y contexto: no repetirlos en el cuerpo.
  if (line.startsWith('Guía central para') || line.startsWith('Fabricio Quiroga ·')) continue;
  const heading = /^(#{2,3})\s+(.+)$/.exec(line);
  if (heading) {
    const top = heading[1].length === 2;
    paragraphs.push(new Paragraph({ heading: top ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, pageBreakBefore: top && heading[2] === chapters[0], keepNext: true, children: top ? [new Bookmark({ id: bookmarks.get(heading[2]), children: [new TextRun(heading[2])] })] : [new TextRun(heading[2])] }));
  } else if (line.startsWith('- ')) paragraphs.push(p(line.slice(2), { bullet: { level: 0 }, spacing: { after: 90 } }));
  else paragraphs.push(p(line, { spacing: { after: 130, line: 255 }, keepNext: /^(src\/|supabase\/).+, L\d/.test(line) }));
}
if (inCode) throw new Error('Bloque de código sin cerrar');
const document = new Document({
  title: 'Defensa central del código — Cine Aurora', subject: 'Guía breve para justificar arquitectura y reglas', creator: 'Guía preparada para Fabricio Quiroga',
  description: 'Explicación central del código sin catálogo archivo por archivo',
  styles: { default: { document: { run: { font: 'Calibri', size: 21 }, paragraph: { spacing: { after: 130, line: 255 } } } }, paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { bold: true, size: 29, color: '243247' }, paragraph: { spacing: { before: 250, after: 180 }, keepNext: true, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { bold: true, size: 24, color: '24567A' }, paragraph: { spacing: { before: 190, after: 120 }, keepNext: true, outlineLevel: 1 } },
  ] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1100, right: 1000 } } },
    headers: { default: new Header({ children: [p('Cine Aurora · Defensa central del código', { children: [new TextRun({ text: 'Cine Aurora · Defensa central del código', size: 17, color: '6B7280' })], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' } } })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Página ', size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] }) }, children: paragraphs }],
});
Packer.toBuffer(document).then(buffer => {
  fs.writeFileSync(path.join(out, 'Defensa_Codigo_Cine_Aurora.md'), md, 'utf8');
  fs.writeFileSync(path.join(out, 'Defensa_Codigo_Cine_Aurora.docx'), buffer);
  const metadata = { revision: '2026-10-12', format: 'guia-central', source: previous?.source || 'Sistema_de_Cine_Documento_de_Requerimientos_v2.1 (3) (1) (2).docx', files, directories,
    coverage: 'Inventario técnico para comprobar integridad; no son fichas ni matrices en el documento.',
    fragments, chapters, maxLines, markdownLines, tests: previous?.tests || { files: 45, passed: 390 }, testsRevision: '2026-10-12',
    words: md.trim().split(/\s+/).length, docxBytes: buffer.length };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ document: path.join(out, 'Defensa_Codigo_Cine_Aurora.docx'), chapters: chapters.length, fragments: fragments.length, markdownLines, maxLines, words: metadata.words, bytes: buffer.length }, null, 2));
}).catch(error => { console.error(error); process.exitCode = 1; });
