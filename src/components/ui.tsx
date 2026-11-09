import { X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-neon text-stage-bg hover:bg-neon-strong font-bold',
  accent: 'bg-signal text-stage-bg hover:brightness-110 font-bold',
  ghost: 'border border-stage-line bg-stage-raised text-stage-text hover:border-signal font-semibold',
  danger: 'border border-danger bg-transparent text-danger hover:bg-danger hover:text-stage-bg font-semibold',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
}

export function Button({ variant = 'ghost', icon: Icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-lg px-4 py-2 text-base transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}
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
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

type BadgeTone = 'green' | 'cyan' | 'neutral';

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'border-neon/60 text-neon',
  cyan: 'border-signal/60 text-signal',
  neutral: 'border-stage-line text-stage-text',
};

export function Badge({ tone = 'neutral', label, children }: { tone?: BadgeTone; label?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-md border bg-stage-bg px-2 py-0.5 text-sm font-semibold ${BADGE_TONES[tone]}`}>
      {label && <span className="text-xs font-medium text-stage-muted">{label}</span>}
      {children}
    </span>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'lg' | 'full';
  /** Bestätigungsdialoge liegen über allen anderen Ebenen. */
  layer?: 'default' | 'top';
  headerExtra?: ReactNode;
}

const MODAL_SIZES = {
  sm: 'sm:max-w-md sm:rounded-xl sm:border sm:h-auto sm:max-h-[85vh]',
  lg: 'sm:max-w-2xl sm:rounded-xl sm:border sm:h-auto sm:max-h-[90vh]',
  full: '',
};

export function Modal({ title, onClose, children, size = 'lg', layer = 'default', headerExtra }: ModalProps) {
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
      className={`fixed inset-0 flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4 ${layer === 'top' ? 'z-[60]' : 'z-50'}`}
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
        className={`flex h-full w-full flex-col border-stage-line bg-stage-surface outline-none pt-safe pb-safe ${MODAL_SIZES[size]}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-stage-line px-4 py-2">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-lg font-bold">
            {title}
          </h2>
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
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-stage-line px-6 py-10 text-center">
      <Icon className="h-10 w-10 text-stage-muted" aria-hidden />
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="max-w-md text-stage-muted">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">{children}</h2>
      {action}
    </div>
  );
}
