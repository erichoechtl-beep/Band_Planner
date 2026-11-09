import { ChevronRight, X, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'destructive';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  destructive: 'bg-danger text-on-fill font-semibold hover:brightness-110',
  primary: 'bg-brand text-on-fill font-semibold hover:bg-brand-strong active:bg-brand-strong',
  accent: 'bg-accent text-on-fill font-semibold hover:brightness-110',
  secondary: 'border border-stage-line bg-stage-raised text-stage-text font-medium hover:border-stage-strong hover:bg-stage-hover',
  ghost: 'text-stage-muted font-medium hover:bg-stage-raised hover:text-stage-text',
  danger: 'text-danger font-medium hover:bg-danger/10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
}

export function Button({ variant = 'secondary', icon: Icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-lg px-4 py-2 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2.25} aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Beschriftung für Screenreader und Tooltip */
  label: string;
  variant?: ButtonVariant;
}

export function IconButton({ icon: Icon, label, variant = 'ghost', className = '', type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
    </button>
  );
}

type BadgeTone = 'green' | 'cyan' | 'amber' | 'neutral';

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'bg-brand/10 text-brand',
  cyan: 'bg-accent/10 text-accent',
  amber: 'bg-warn/10 text-warn',
  neutral: 'bg-stage-raised text-stage-muted',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Kennzahl mit kleiner Beschriftung, z. B. Tonart oder Tempo. */
export function Stat({ label, value, tone = 'neutral', size = 'md' }: { label: string; value: string; tone?: 'green' | 'cyan' | 'amber' | 'neutral'; size?: 'md' | 'xl' }) {
  const color = tone === 'green' ? 'text-brand' : tone === 'cyan' ? 'text-accent' : tone === 'amber' ? 'text-warn' : 'text-stage-text';
  return (
    <div className={`rounded-xl border border-stage-line bg-stage-surface ${size === 'xl' ? 'px-4 py-2.5 sm:px-5 sm:py-3' : 'px-3 py-2'}`}>
      <div className="eyebrow">{label}</div>
      <div className={`font-bold tabular-nums leading-tight tracking-tight ${color} ${size === 'xl' ? 'text-2xl sm:text-4xl' : 'text-lg'}`}>{value}</div>
    </div>
  );
}

/** Zeigt den Song-Ablauf als Abfolge von Teilen. Akkorde in Klammern werden hervorgehoben. */
export function StructureFlow({ structure, size = 'md' }: { structure: string; size?: 'md' | 'xl' }) {
  const parts = structure
    .split(/\s*(?:→|->|>|›)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const pill = size === 'xl' ? 'px-2.5 py-1 text-lg sm:px-3 sm:py-1.5 sm:text-2xl' : 'px-2.5 py-1 text-sm';
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label={`Song-Ablauf: ${structure}`}>
      {parts.map((part, index) => {
        const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(part);
        return (
          <Fragment key={`${part}-${index}`}>
            {index > 0 && <ChevronRight className={`shrink-0 text-stage-subtle ${size === 'xl' ? 'h-5 w-5' : 'h-4 w-4'}`} aria-hidden />}
            <li className={`rounded-md border border-stage-line bg-stage-raised font-semibold ${pill}`}>
              {match ? (
                <>
                  {match[1]} <span className="font-mono font-bold text-accent">{match[2]}</span>
                </>
              ) : (
                part
              )}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'lg' | 'full';
  /** Bestätigungsdialoge liegen über allen anderen Ebenen. */
  layer?: 'default' | 'top';
  headerExtra?: ReactNode;
}

const MODAL_SIZES = {
  sm: 'sm:max-w-md sm:rounded-2xl sm:border sm:h-auto sm:max-h-[85vh] sm:shadow-pop',
  lg: 'sm:max-w-2xl sm:rounded-2xl sm:border sm:h-auto sm:max-h-[90vh] sm:shadow-pop',
  full: '',
};

export function Modal({ title, subtitle, onClose, children, size = 'lg', layer = 'default', headerExtra }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Immer die aktuelle Schließen-Funktion verwenden, ohne den Fokus-Effekt neu auszulösen.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current();
    };
    const dialog = dialogRef.current;
    dialog?.addEventListener('keydown', handleKey);
    return () => {
      dialog?.removeEventListener('keydown', handleKey);
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 flex items-stretch justify-center bg-backdrop/60 backdrop-blur-sm sm:items-center sm:p-4 ${layer === 'top' ? 'z-[60]' : 'z-50'}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex h-full w-full flex-col overflow-hidden border-stage-line bg-stage-surface outline-none pt-safe pb-safe ${MODAL_SIZES[size]}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-stage-line py-2 pl-5 pr-2">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold sm:text-lg">
              {title}
            </h2>
            {subtitle && <p className="truncate text-sm text-stage-muted">{subtitle}</p>}
          </div>
          {headerExtra}
          <IconButton icon={X} label="Schließen" onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stage-line px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stage-raised">
        <Icon className="h-6 w-6 text-stage-muted" aria-hidden />
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-stage-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h2>
        {description && <p className="mt-1 text-[15px] text-stage-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold tracking-tight">{children}</h3>
      {action}
    </div>
  );
}

export function InfoNote({ icon: Icon, children, tone = 'green' }: { icon: LucideIcon; children: ReactNode; tone?: 'green' | 'amber' }) {
  const color = tone === 'green' ? 'text-brand' : 'text-warn';
  return (
    <p className="flex items-start gap-3 rounded-xl border border-stage-line bg-stage-surface px-4 py-3 text-sm text-stage-muted">
      <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${color}`} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
