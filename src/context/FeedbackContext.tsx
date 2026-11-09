import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Modal } from '../components/ui';

type ToastTone = 'success' | 'error';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface FeedbackContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      // Fehler bleiben länger stehen, weil man sie auf der Bühne oft erst später sieht.
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 3500);
    },
    [dismiss],
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ ...options, resolve }));
  }, []);

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {pending && (
        <Modal title={pending.title} onClose={() => settle(false)} size="sm" layer="top">
          <div className="flex gap-3 p-4">
            {pending.danger && <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warn" aria-hidden />}
            <p className="whitespace-pre-line text-base leading-relaxed">{pending.message}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-stage-line p-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => settle(false)}>
              Abbrechen
            </Button>
            <Button variant={pending.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
              {pending.confirmLabel}
            </Button>
          </div>
        </Modal>
      )}

      {/* Oben statt unten: Meldungen dürfen die großen Song-Tasten der Bühnenansicht nie verdecken. */}
      <div className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[70] flex flex-col items-center gap-2 p-3" aria-live="polite">
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-xl border bg-stage-raised p-3 shadow-2xl ${
              item.tone === 'error' ? 'border-danger' : 'border-neon'
            }`}
          >
            {item.tone === 'error' ? (
              <XCircle className="mt-3 h-5 w-5 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-3 h-5 w-5 shrink-0 text-neon" aria-hidden />
            )}
            <p className="flex-1 py-2.5 text-sm font-medium">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Meldung schließen"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-stage-muted hover:bg-stage-surface"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback muss innerhalb von FeedbackProvider verwendet werden.');
  return context;
}
