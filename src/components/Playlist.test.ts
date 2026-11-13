import { describe, expect, it } from 'vitest';
import type { Song } from '../db/schema';
import { appleMusicSearchUrl, playlistText, spotifySearchUrl } from './Playlist';

const song = (title: string, artist: string): Song => ({
  id: title, title, artist, key: '', bpm: null, tuning: '', leadVocals: '', duration: '', structure: '', chords: '', pdfName: null, drumSheetName: null, bassSheetName: null,
});

describe('Playlist', () => {
  it('erzeugt eine Zeile pro Song im Format „Interpret - Titel“ und lässt Platzhalter weg', () => {
    expect(playlistText([song('Yellow', 'Coldplay'), song('Over the Mountains', '?'), song('Feuer', '')])).toBe('Coldplay - Yellow\nOver the Mountains\nFeuer');
  });

  it('baut Suchlinks für Spotify und Apple Music', () => {
    expect(spotifySearchUrl(song("Shouldn't Matter but It Does", 'John Mayer'))).toBe('https://open.spotify.com/search/Shouldn\'t%20Matter%20but%20It%20Does%20John%20Mayer');
    expect(appleMusicSearchUrl(song('Strada del Sole', 'Rainhard Fendrich'))).toBe('https://music.apple.com/search?term=Strada%20del%20Sole%20Rainhard%20Fendrich');
  });
});
