import { UserFacingError } from './files';

/**
 * Wandelt Fotos (z. B. abfotografierte Drum Sheets) in ein mehrseitiges PDF um – eine Seite pro Bild.
 * Das passiert komplett auf dem Gerät; dadurch funktionieren Anzeige, Auto-Scroll und Band-Sync
 * genauso wie bei echten PDFs.
 */

/** Lange Kante in Pixeln: scharf genug für Noten, klein genug für den Band-Sync. */
const MAX_EDGE = 2200;
const JPEG_QUALITY = 0.85;
/** Seitenbreite im PDF (A4-Breite in Punkt); die Höhe folgt dem Seitenverhältnis des Bildes. */
const PAGE_WIDTH = 595;

export interface JpegPage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

const encoder = new TextEncoder();

/** Baut ein gültiges PDF aus JPEG-Bildern (DCTDecode). Reine Funktion, ohne Browser-Abhängigkeiten. */
export function buildJpegPdf(pages: JpegPage[]): Uint8Array {
  if (pages.length === 0) throw new Error('Keine Seiten');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  // Objekte: 1 Katalog, 2 Seitenbaum, danach je Seite: Seite, Inhalt, Bild
  const pageId = (index: number) => 3 + index * 3;
  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')}] >>`));

  pages.forEach((page, index) => {
    const id = pageId(index);
    const height = Math.round((PAGE_WIDTH * page.height) / page.width);
    const content = `q ${PAGE_WIDTH} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    object(id, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${height}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`),
    );
    object(id + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(id + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
      push(page.jpeg);
      push('\nendstream');
    });
  });

  const count = 3 + pages.length * 3;
  const xrefStart = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const result = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UserFacingError(`„${file.name}“ kann nicht als Bild gelesen werden. Bitte als JPG oder PNG speichern und erneut versuchen.`));
    };
    image.src = url;
  });
}

/** Zeichnet ein Bild verkleinert auf weißen Grund und liefert es als JPEG. */
async function toJpegPage(file: File): Promise<JpegPage> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new UserFacingError('Das Bild konnte nicht umgewandelt werden.');
  // Weißer Hintergrund, damit transparente PNGs nicht schwarz werden.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new UserFacingError('Das Bild konnte nicht umgewandelt werden.');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
}

export async function imagesToPdf(files: File[]): Promise<ArrayBuffer> {
  const pages: JpegPage[] = [];
  for (const file of files) pages.push(await toJpegPage(file));
  const pdf = buildJpegPdf(pages);
  return pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
}

export const isImageFile = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
