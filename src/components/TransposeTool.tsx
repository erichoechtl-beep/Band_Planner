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
  const size = large ? 'h-14 w-14' : '';
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-stage-line bg-stage-surface p-1.5" role="group" aria-label="Transponieren">
      <IconButton
        icon={Minus}
        label="Einen Halbton tiefer (−1)"
        variant="secondary"
        onClick={() => onChange(semitones - 1)}
        disabled={semitones <= -11}
        className={size}
      />
      <div className="min-w-0 flex-1 px-1 text-center" aria-live="polite">
        <div className="eyebrow">Transponieren</div>
        <div className={`font-mono font-bold leading-tight ${semitones === 0 ? 'text-stage-text' : 'text-neon'} ${large ? 'text-2xl' : 'text-xl'}`}>
          {transposedKey || '–'}
        </div>
        <div className="truncate text-xs text-stage-subtle">
          {semitones === 0
            ? 'Original'
            : `${formatSemitones(semitones)} ${Math.abs(semitones) === 1 ? 'Halbton' : 'Halbtöne'}${originalKey ? ` · Original ${originalKey}` : ''}`}
        </div>
      </div>
      <IconButton
        icon={Plus}
        label="Einen Halbton höher (+1)"
        variant="secondary"
        onClick={() => onChange(semitones + 1)}
        disabled={semitones >= 11}
        className={size}
      />
      <IconButton icon={RotateCcw} label="Zurück zur Original-Tonart" onClick={() => onChange(0)} disabled={semitones === 0} className={size} />
    </div>
  );
}
