// Erzeugt die PWA-Icons ohne Zusatzpakete (reines Node.js): npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [0x1d, 0x4e, 0xd8];
const WHITE = [0xff, 0xff, 0xff];
const LIGHT = [0xbf, 0xdb, 0xfe];

// Equalizer-Balken als Anteile der Bildgröße: x, oben, Farbe
const BARS = [
  { x: 11 / 64, top: 28 / 64, color: WHITE },
  { x: 23 / 64, top: 16 / 64, color: LIGHT },
  { x: 35 / 64, top: 22 / 64, color: WHITE },
  { x: 47 / 64, top: 12 / 64, color: LIGHT },
];
const BAR_WIDTH = 7 / 64;
const BAR_BOTTOM = 48 / 64;

function insideRoundedBar(px, py, left, top, width, height) {
  const r = width / 2;
  if (px < left || px > left + width || py < top || py > top + height) return false;
  const cy = py < top + r ? top + r : py > top + height - r ? top + height - r : py;
  const dx = px - (left + r);
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function pixelColor(u, v, inset) {
  // u/v liegen in 0..1; inset verkleinert das Motiv für die Maskable-Sicherheitszone.
  const x = (u - inset) / (1 - 2 * inset);
  const y = (v - inset) / (1 - 2 * inset);
  for (const bar of BARS) {
    if (insideRoundedBar(x, y, bar.x, bar.top, BAR_WIDTH, BAR_BOTTOM - bar.top)) return bar.color;
  }
  return BG;
}

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, inset) {
  const SAMPLES = 4; // Kantenglättung
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [cr, cg, cb] = pixelColor((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size, inset);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = SAMPLES * SAMPLES;
      raw[o++] = Math.round(r / n);
      raw[o++] = Math.round(g / n);
      raw[o++] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bit-Tiefe
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12],
  ['apple-touch-icon.png', 180, 0.06],
];

for (const [name, size, inset] of files) {
  writeFileSync(join(outDir, name), png(size, inset));
  console.log(`Icon erstellt: public/icons/${name}`);
}
