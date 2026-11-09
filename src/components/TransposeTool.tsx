import { Minus, Plus, RotateCcw } from 'lucide-react';
import { formatSemitones } from '../lib/transpose';
import { IconButton } from './ui';

interface TransposeToolProps {
  semitones: number;
  originalKey: string;
  transposedKey: string;
  onChange: (semitones: number) => void;
  large?: boolean;
}

/** Halbton-Transponierer: Wirkt nur auf die Anzeige und ändert die gespeicherten Band-Daten nicht. */
export function TransposeTool({ semitones, originalKey, transposedKey, onChange, large = false }: TransposeToolProps) {
  const buttonSize = large ? 'h-14 w-14' : '';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stage-line bg-stage-bg p-2" role="group" aria-label="Transponieren">
      <IconButton
        icon={Minus}
        label="Einen Halbton tiefer (−1)"
        onClick={() => onChange(semitones - 1)}
        disabled={semitones <= -11}
        className={buttonSize}
      />
      <div className="min-w-24 flex-1 px-1 text-center" aria-live="polite">
        <div className={`font-extrabold leading-tight text-neon ${large ? 'text-3xl' : 'text-2xl'}`}>{transposedKey || '–'}</div>
        <div className="text-xs font-medium text-stage-muted">
          {semitones === 0 ? 'Original' : `${formatSemitones(semitones)} ${Math.abs(semitones) === 1 ? 'Halbton' : 'Halbtöne'}${originalKey ? ` · Original ${originalKey}` : ''}`}
        </div>
      </div>
      <IconButton
        icon={Plus}
        label="Einen Halbton höher (+1)"
        onClick={() => onChange(semitones + 1)}
        disabled={semitones >= 11}
        className={buttonSize}
      />
      <IconButton
        icon={RotateCcw}
        label="Zurück zur Original-Tonart"
        onClick={() => onChange(0)}
        disabled={semitones === 0}
        className={buttonSize}
      />
    </div>
  );
}
