// Transponier-Logik: Tonart, Akkordblätter und Song-Ablauf um Halbtöne verschieben.
//
// Internationale Notation ist Standard (B = h, Bb = b). Sobald in einem Song ein H-Akkord
// vorkommt, gilt er als deutsch notiert: H = h, B = b. So wird aus „C“ + 11 nie ein „B“,
// das ein deutscher Musiker als b lesen würde.

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Tonarten mit b-Vorzeichen
const FLAT_MAJOR_KEYS = new Set([1, 3, 5, 8, 10]);
const FLAT_MINOR_KEYS = new Set([0, 2, 3, 5, 7, 10]);

const CHORD_SUFFIX = '(?:maj|Maj|MAJ|min|mi|m|M|dim|aug|sus|add|omit|no|alt|[+°øΔ-]|[b#♭♯]?\\d{1,2}|[()],?)*';
const CHORD_PATTERN = new RegExp(`^([A-H])([#b♯♭]?)(${CHORD_SUFFIX})(?:/([A-H])([#b♯♭]?))?$`);
const KEY_PATTERN = /^\s*([A-Ha-h])([#b♯♭]?)(\s*-?\s*(?:moll|dur|min|maj|m)?)\s*$/i;
const NEUTRAL_TOKEN = /^(?:x?\d+x?|[-–—→/%.:]+|N\.?C\.?)$/i;
const LINE_LABEL = /^(\s*(?:\[[^\]]*\]\s+|[\p{L}\d][\p{L}\d .'-]*:\s+))(.*)$/u;

interface Spelling {
  german: boolean;
  /** null = pro Akkord entscheiden, wenn keine Tonart hinterlegt ist. */
  flats: boolean | null;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function noteToSemitone(letter: string, accidental: string, german: boolean): number {
  const base = german && letter === 'B' ? 10 : SEMITONES[letter];
  if (accidental === '#' || accidental === '♯') return mod12(base + 1);
  if (accidental === 'b' || accidental === '♭') return mod12(base - 1);
  return base;
}

function spellNote(semitone: number, flats: boolean, german: boolean): string {
  const name = (flats ? FLAT_NAMES : SHARP_NAMES)[semitone];
  if (!german) return name;
  if (name === 'B') return 'H';
  if (name === 'Bb' || name === 'A#') return 'B';
  return name;
}

function isChordMinor(suffix: string): boolean {
  return /^(?:m(?!aj)|mi|min)/.test(suffix);
}

/** Üblichste Schreibweise, wenn keine Tonart bekannt ist (F#, C#m, G#m – sonst b). */
function defaultFlats(semitone: number, minor: boolean): boolean {
  return minor ? FLAT_MINOR_KEYS.has(semitone) || semitone === 10 : semitone !== 6;
}

export function isChord(token: string): boolean {
  return CHORD_PATTERN.test(token);
}

function transposeParsedChord(token: string, semitones: number, spelling: Spelling): string {
  const match = CHORD_PATTERN.exec(token);
  if (!match) return token;
  const [, letter, accidental, suffix, bassLetter, bassAccidental] = match;
  const root = mod12(noteToSemitone(letter, accidental, spelling.german) + semitones);
  const flats = spelling.flats ?? defaultFlats(root, isChordMinor(suffix));
  let result = spellNote(root, flats, spelling.german) + suffix;
  if (bassLetter) {
    const bass = mod12(noteToSemitone(bassLetter, bassAccidental, spelling.german) + semitones);
    // Ohne Tonart gelten für den Bass die gängigen Namen: C# und F#, sonst b.
    const bassFlats = spelling.flats ?? (bass !== 1 && bass !== 6);
    result += `/${spellNote(bass, bassFlats, spelling.german)}`;
  }
  return result;
}

/** Einzelner Akkord, z. B. transposeChord('Am', 1) === 'Bbm' */
export function transposeChord(chord: string, semitones: number): string {
  if (mod12(semitones) === 0) return chord;
  return transposeParsedChord(chord, semitones, { german: /^H/.test(chord), flats: null });
}

interface ParsedKey {
  semitone: number;
  minor: boolean;
  suffix: string;
}

function parseKey(key: string, german: boolean): ParsedKey | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const [, letter, accidental, rawSuffix] = match;
  const isLowerMinor = letter === letter.toLowerCase() && rawSuffix.trim() === '';
  const suffix = isLowerMinor ? 'm' : rawSuffix;
  const normalized = suffix.toLowerCase().replace(/[\s-]/g, '');
  return {
    semitone: noteToSemitone(letter.toUpperCase(), accidental, german),
    minor: normalized === 'm' || normalized === 'min' || normalized === 'moll',
    suffix,
  };
}

function keyUsesFlats(semitone: number, minor: boolean): boolean {
  return minor ? FLAT_MINOR_KEYS.has(semitone) : FLAT_MAJOR_KEYS.has(semitone);
}

function mentionsGermanH(key: string, ...texts: string[]): boolean {
  if (/^\s*[Hh]/.test(key)) return true;
  for (const text of texts) {
    for (const token of text.match(/[^\s|()[\],]+/g) ?? []) {
      if (token.startsWith('H') && isChord(token)) return true;
      if (token.includes('/H') && isChord(token)) return true;
    }
  }
  return false;
}

function transposeToken(token: string, semitones: number, spelling: Spelling): string {
  return token.replace(/[^|(),\s]+/g, (part) => (isChord(part) ? transposeParsedChord(part, semitones, spelling) : part));
}

function isChordLine(text: string): boolean {
  const tokens = text.match(/[^\s|(),]+/g);
  if (!tokens) return false;
  let chords = 0;
  for (const token of tokens) {
    if (isChord(token)) chords += 1;
    else if (!NEUTRAL_TOKEN.test(token)) return false;
  }
  return chords > 0;
}

/** Tauscht die Akkorde einer Zeile und korrigiert die Abstände, damit sie über dem Text stehen bleiben. */
function transposeAligned(line: string, semitones: number, spelling: Spelling): string {
  let output = '';
  let position = 0;
  let drift = 0;
  for (const match of line.matchAll(/\S+/g)) {
    const gap = match.index - position;
    const minimumGap = gap > 0 && output.trim() !== '' ? 1 : 0;
    const newGap = Math.max(minimumGap, gap - drift);
    drift += newGap - gap;
    const replaced = transposeToken(match[0], semitones, spelling);
    drift += replaced.length - match[0].length;
    output += ' '.repeat(newGap) + replaced;
    position = match.index + match[0].length;
  }
  return output;
}

function transposeSheetLine(line: string, semitones: number, spelling: Spelling): string {
  let hadBracketChord = false;
  const bracketed = line.replace(/\[([^\]]+)\]/g, (whole, inner: string) => {
    if (!isChord(inner.trim())) return whole;
    hadBracketChord = true;
    return `[${transposeParsedChord(inner.trim(), semitones, spelling)}]`;
  });
  if (hadBracketChord) return bracketed;

  if (isChordLine(line)) return transposeAligned(line, semitones, spelling);

  const label = LINE_LABEL.exec(line);
  if (label && isChordLine(label[2])) {
    return label[1] + transposeAligned(label[2], semitones, spelling);
  }
  return line;
}

export interface TransposableSong {
  key: string;
  chords: string;
  structure: string;
}

export interface TransposedSong {
  key: string;
  chords: string;
  structure: string;
}

/**
 * Rechnet Tonart, Akkorde und die Akkorde im Song-Ablauf (z. B. „Solo (Am)“) um.
 * Liedtext-Zeilen bleiben unverändert – auch wenn sie mit „Am“ beginnen.
 */
export function transposeSong(song: TransposableSong, semitones: number): TransposedSong {
  if (mod12(semitones) === 0) return { key: song.key, chords: song.chords, structure: song.structure };

  const german = mentionsGermanH(song.key, song.chords);
  const parsedKey = parseKey(song.key, german);
  let flats: boolean | null = null;
  let key = song.key;
  if (parsedKey) {
    const target = mod12(parsedKey.semitone + semitones);
    flats = keyUsesFlats(target, parsedKey.minor);
    key = spellNote(target, flats, german) + parsedKey.suffix;
  }
  const spelling: Spelling = { german, flats };

  const chords = song.chords
    .split('\n')
    .map((line) => transposeSheetLine(line, semitones, spelling))
    .join('\n');

  const structure = song.structure.replace(/\(([^)]+)\)/g, (whole, inner: string) =>
    isChordLine(inner) ? `(${transposeToken(inner, semitones, spelling)})` : whole,
  );

  return { key, chords, structure };
}

/** Anzeige des Versatzes: „+2“, „−1“ oder „Original“. */
export function formatSemitones(semitones: number): string {
  if (semitones === 0) return 'Original';
  return semitones > 0 ? `+${semitones}` : `−${Math.abs(semitones)}`;
}
