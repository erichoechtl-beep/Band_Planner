/** Fehler, dessen deutscher Text direkt in der Oberfläche angezeigt werden kann. */
export class UserFacingError extends Error {}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Dekodiert Base64 (auch mit „data:…;base64,“-Präfix). Wirft bei ungültigen Zeichen. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** PDFs beginnen spätestens innerhalb der ersten 1024 Byte mit „%PDF“. */
export function looksLikePdf(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength));
  for (let i = 0; i + 3 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) return true;
  }
  return false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

const MAX_IMAGE_EDGE = 1600;
const RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;

export interface PreparedImage {
  data: ArrayBuffer;
  mimeType: string;
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UserFacingError(`„${file.name}“ konnte nicht als Bild gelesen werden.`));
    };
    image.src = url;
  });
}

/**
 * Handyfotos werden verkleinert, damit die band-data.json für WhatsApp und GitHub klein genug bleibt.
 * PNGs behalten ihr Format (Transparenz bei Logos), SVG und GIF bleiben unverändert.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new UserFacingError(`„${file.name}“ hat kein unterstütztes Bildformat (JPG, PNG, WebP, GIF, SVG).`);
  }
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return { data: await file.arrayBuffer(), mimeType: file.type };
  }

  const image = await decodeImage(file);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  if (longestEdge <= MAX_IMAGE_EDGE && file.size <= RESIZE_ABOVE_BYTES) {
    return { data: await file.arrayBuffer(), mimeType: file.type };
  }

  const scale = Math.min(1, MAX_IMAGE_EDGE / longestEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) return { data: await file.arrayBuffer(), mimeType: file.type };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const targetType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, targetType, 0.85));
  if (!blob) return { data: await file.arrayBuffer(), mimeType: file.type };
  return { data: await blob.arrayBuffer(), mimeType: targetType };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
