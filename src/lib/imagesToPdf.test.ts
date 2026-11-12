import { describe, expect, it } from 'vitest';
import { looksLikePdf } from './files';
import { buildJpegPdf } from './imagesToPdf';

const fakeJpeg = (size: number) => Uint8Array.from({ length: size }, (_, index) => (index * 37) % 256);

describe('Fotos zu PDF', () => {
  const pdf = buildJpegPdf([
    { jpeg: fakeJpeg(1200), width: 1600, height: 2200 },
    { jpeg: fakeJpeg(800), width: 2200, height: 1600 },
  ]);
  const text = new TextDecoder('latin1').decode(pdf);

  it('erzeugt ein PDF, das die App als PDF erkennt', () => {
    expect(looksLikePdf(pdf.buffer as ArrayBuffer)).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('legt eine Seite pro Bild an, im Seitenverhältnis des Bildes', () => {
    expect(text).toContain('/Type /Pages /Count 2');
    expect(text).toContain('/MediaBox [0 0 595 818]');
    expect(text).toContain('/MediaBox [0 0 595 433]');
    expect(text.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);
  });

  it('hat eine korrekte Querverweistabelle', () => {
    const xrefStart = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xrefStart, xrefStart + 4)).toBe('xref');
    const entries = text.slice(xrefStart).split('\n').slice(3).filter((line) => / n $/.test(line));
    expect(entries).toHaveLength(8);
    entries.forEach((line, index) => {
      const offset = Number(line.slice(0, 10));
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });

  it('lehnt eine leere Auswahl ab', () => {
    expect(() => buildJpegPdf([])).toThrow();
  });
});
