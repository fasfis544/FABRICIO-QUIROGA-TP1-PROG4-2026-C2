// PNGs reproducibles sin dependencias de diseño. Ejecutar: node tools/generar-iconos-pwa.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const directory = path.join(__dirname, '../public/icons');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const star = [
  [0.5, 0.26], [0.562, 0.438], [0.74, 0.5], [0.562, 0.562],
  [0.5, 0.74], [0.438, 0.562], [0.26, 0.5], [0.438, 0.438],
];

function insideStar(x, y) {
  let inside = false;
  for (let i = 0, j = star.length - 1; i < star.length; j = i++) {
    const [xi, yi] = star[i];
    const [xj, yj] = star[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function color(x, y) {
  // Fondo opaco y marca dentro de la zona segura de un icono maskable.
  const dx = Math.max(Math.abs(x - 0.5) - 0.19, 0);
  const dy = Math.max(Math.abs(y - 0.5) - 0.19, 0);
  if (dx * dx + dy * dy > 0.13 * 0.13) return [9, 9, 11];
  return insideStar(x, y) ? [17, 17, 19] : [228, 228, 231];
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

fs.mkdirSync(directory, { recursive: true });
for (const size of sizes) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const rgb = color((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          rgb.forEach((value, channel) => { sum[channel] += value; });
        }
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      sum.forEach((value, channel) => { raw[offset + channel] = Math.round(value / 16); });
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path.join(directory, `icon-${size}x${size}.png`), png);
}
console.log(`Generados ${sizes.length} iconos de Cine Aurora.`);
