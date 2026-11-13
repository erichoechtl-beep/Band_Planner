import { Copy, ExternalLink, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import type { Setlist, Song } from '../db/schema';
import { groupByStatus, resolveSongs } from '../lib/setlist';
import { Button, Modal } from './ui';

/** Suchbegriff für Streaming-Dienste: Titel und Interpret, ohne Platzhalter wie „?“. */
function searchTerm(song: Song): string {
  const artist = song.artist.trim() === '?' ? '' : song.artist.trim();
  return `${song.title} ${artist}`.trim();
}

export const spotifySearchUrl = (song: Song) => `https://open.spotify.com/search/${encodeURIComponent(searchTerm(song))}`;
export const appleMusicSearchUrl = (song: Song) => `https://music.apple.com/search?term=${encodeURIComponent(searchTerm(song))}`;

/** Eine Zeile pro Song im Format „Interpret - Titel“ – so lesen Playlist-Dienste freien Text ein. */
export function playlistText(songs: Song[]): string {
  return songs
    .map((song) => {
      const artist = song.artist.trim() === '?' ? '' : song.artist.trim();
      return artist ? `${artist} - ${song.title}` : song.title;
    })
    .join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Ältere Browser oder fehlende Berechtigung: über ein unsichtbares Textfeld kopieren.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

const LINK = 'inline-flex min-h-touch items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors';

/**
 * Bringt die Setlist zu Spotify oder Apple Music – ohne Konto in dieser App: Liste kopieren und bei
 * einem Playlist-Dienst einfügen, oder Songs einzeln direkt im Streaming-Dienst öffnen.
 */
export function PlaylistModal({ setlist, songsById, onClose }: { setlist: Setlist; songsById: Map<string, Song>; onClose: () => void }) {
  const { toast } = useFeedback();
  const [withOpen, setWithOpen] = useState(false);
  const groups = groupByStatus(setlist, resolveSongs(setlist, songsById));
  const songs = withOpen ? [...groups.fix, ...groups.offen] : groups.fix;
  const text = playlistText(songs);
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    const ok = await copyText(text);
    toast(ok ? `${songs.length} Songs kopiert – jetzt beim Playlist-Dienst einfügen.` : 'Kopieren hat nicht geklappt. Bitte die Liste markieren und manuell kopieren.', ok ? 'success' : 'error');
  };

  const share = async () => {
    try {
      await navigator.share({ title: `${setlist.name} – Songliste`, text });
    } catch {
      // abgebrochen
    }
  };

  return (
    <Modal title="Als Playlist" subtitle={setlist.name} onClose={onClose}>
      <div className="flex flex-col gap-5 p-5">
        <div role="group" aria-label="Welche Songs" className="grid grid-cols-2 gap-1 rounded-lg border border-stage-line bg-stage-bg p-1">
          {[
            { value: false, label: `Nur fix (${groups.fix.length})` },
            { value: true, label: `Fix + Abklärung (${groups.fix.length + groups.offen.length})` },
          ].map(({ value, label }) => (
            <button
              key={label}
              type="button"
              aria-pressed={withOpen === value}
              onClick={() => setWithOpen(value)}
              className={`min-h-touch rounded-md px-2 text-sm font-semibold transition-colors ${withOpen === value ? 'bg-stage-surface shadow-panel' : 'text-stage-muted hover:text-stage-text'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="card p-4">
          <h3 className="font-semibold">Ganze Liste als Playlist</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stage-muted">
            <li>„Liste kopieren“ antippen.</li>
            <li>TuneMyMusic oder Soundiiz öffnen (Knöpfe unten), als Quelle „Text“ wählen und die Liste einfügen.</li>
            <li>Als Ziel Spotify oder Apple Music wählen – der Dienst legt die Playlist in deinem Konto an.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={Copy} onClick={copy} disabled={songs.length === 0}>
              Liste kopieren
            </Button>
            {canShare && (
              <Button icon={Share2} onClick={share} disabled={songs.length === 0}>
                Teilen
              </Button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href="https://www.tunemymusic.com/" target="_blank" rel="noopener noreferrer" className={`${LINK} border border-stage-line bg-stage-raised hover:bg-stage-hover`}>
              TuneMyMusic öffnen <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <a href="https://soundiiz.com/" target="_blank" rel="noopener noreferrer" className={`${LINK} border border-stage-line bg-stage-raised hover:bg-stage-hover`}>
              Soundiiz öffnen <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </section>

        <section>
          <h3 className="eyebrow mb-2">Songs einzeln öffnen</h3>
          {songs.length === 0 ? (
            <p className="text-sm text-stage-muted">In dieser Auswahl ist noch kein Song.</p>
          ) : (
            <ol className="card divide-y divide-stage-line">
              {songs.map((song, index) => (
                <li key={song.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap sm:px-4">
                  <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-stage-subtle">{index + 1}</span>
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate font-medium">{song.title}</span>
                    {song.artist && song.artist !== '?' && <span className="block truncate text-sm text-stage-muted">{song.artist}</span>}
                  </span>
                  <span className="ml-9 flex shrink-0 gap-1.5 sm:ml-0">
                    <a
                      href={spotifySearchUrl(song)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`„${song.title}“ in Spotify öffnen`}
                      className={`${LINK} bg-[#1DB954]/15 text-[#0f7a37] hover:bg-[#1DB954]/25 dark:text-[#1ed760]`}
                    >
                      Spotify <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                    <a
                      href={appleMusicSearchUrl(song)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`„${song.title}“ in Apple Music öffnen`}
                      className={`${LINK} bg-[#FA2D48]/10 text-[#c4142c] hover:bg-[#FA2D48]/20 dark:text-[#ff6b7f]`}
                    >
                      Apple Music <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  );
}
