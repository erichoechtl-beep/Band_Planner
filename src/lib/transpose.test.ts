import { describe, expect, it } from 'vitest';
import { isChord, transposeChord, transposeSong } from './transpose';

const song = (key: string, chords = '', structure = '') => ({ key, chords, structure });

describe('transposeChord', () => {
  it('rechnet Am +1 auf Bbm um', () => {
    expect(transposeChord('Am', 1)).toBe('Bbm');
  });

  it('wechselt mit −1 zurück', () => {
    expect(transposeChord('Bbm', -1)).toBe('Am');
  });

  it('erhält Zusätze und Bassnoten', () => {
    expect(transposeChord('Dm7b5', 2)).toBe('Em7b5');
    expect(transposeChord('Cadd9', 2)).toBe('Dadd9');
    expect(transposeChord('G/B', 2)).toBe('A/C#');
    expect(transposeChord('Gsus4', 5)).toBe('Csus4');
  });

  it('nutzt die übliche Schreibweise ohne Tonart', () => {
    expect(transposeChord('F', 1)).toBe('F#');
    expect(transposeChord('C', 1)).toBe('Db');
    expect(transposeChord('Cm', 1)).toBe('C#m');
  });
});

describe('isChord', () => {
  it.each(['A', 'Am', 'Bb', 'C#m7', 'Fmaj7', 'Ddim', 'Aadd9', 'E7', 'Hm', 'G/B'])('%s ist ein Akkord', (token) => {
    expect(isChord(token)).toBe(true);
  });

  it.each(['Abend', 'Es', 'Da', 'Die', 'Dad', 'Add', 'Strophe', 'Hallo', 'am'])('%s ist kein Akkord', (token) => {
    expect(isChord(token)).toBe(false);
  });
});

describe('transposeSong', () => {
  it('rechnet die Tonart um und erhält die Schreibweise', () => {
    expect(transposeSong(song('Am'), 1).key).toBe('Bbm');
    expect(transposeSong(song('A-Moll'), 1).key).toBe('Bb-Moll');
    expect(transposeSong(song('C'), 1).key).toBe('Db');
    expect(transposeSong(song('E'), 2).key).toBe('F#');
  });

  it('richtet die Schreibweise der Akkorde nach der Zieltonart', () => {
    const result = transposeSong(song('G', 'G  D  Em  C'), 1);
    expect(result.key).toBe('Ab');
    // Akkorde bleiben in ihrer Spalte: Längere Namen verkürzen den Abstand.
    expect(result.chords).toBe('Ab Eb Fm  Db');
  });

  it('lässt Liedtext und Abschnittsnamen unverändert', () => {
    const text = '[Strophe]\nAm Abend geht es los\nEs ist so weit\nRefrain: wir singen';
    expect(transposeSong(song('Am', text), 3).chords).toBe(text);
  });

  it('transponiert Inline-Akkorde, Takte und beschriftete Zeilen', () => {
    expect(transposeSong(song('C', '[C]Ein Wort [G]noch'), 2).chords).toBe('[D]Ein Wort [A]noch');
    expect(transposeSong(song('C', '| C | G | Am F |'), 2).chords).toBe('| D | A | Bm G |');
    expect(transposeSong(song('C', 'Outro: C  G  x2'), 2).chords).toBe('Outro: D  A  x2');
    expect(transposeSong(song('C', '[Intro] C  G'), 2).chords).toBe('[Intro] D  A');
  });

  it('hält Akkorde über dem Text ausgerichtet', () => {
    const before = 'C       G       Am';
    const after = transposeSong(song('C', before), 1).chords;
    expect(after).toBe('Db      Ab      Bbm');
    expect(after.indexOf('Ab')).toBe(before.indexOf('G'));
    expect(after.indexOf('Bbm')).toBe(before.indexOf('Am'));
  });

  it('rechnet nur Akkorde in Klammern im Song-Ablauf um', () => {
    const structure = 'Intro → Strophe → Refrain → Solo (Am) → Outro (leise)';
    expect(transposeSong(song('Am', '', structure), 1).structure).toBe(
      'Intro → Strophe → Refrain → Solo (Bbm) → Outro (leise)',
    );
  });

  it('erkennt deutsche Notation an H-Akkorden', () => {
    expect(transposeSong(song('', 'H  E  F#'), 1).chords).toBe('C  F  G');
    expect(transposeSong(song('C', 'C  H'), 11).key).toBe('H');
    // In deutscher Notation ist B ein b: B + 1 = H
    expect(transposeSong(song('H', 'B  H'), 1).chords).toBe('H  C');
  });

  it('ändert bei 0 und vollen Oktaven nichts', () => {
    const input = song('Am', 'Am  F', 'Solo (Am)');
    expect(transposeSong(input, 0)).toEqual(input);
    expect(transposeSong(input, 12)).toEqual(input);
  });
});
