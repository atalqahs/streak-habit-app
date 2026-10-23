import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Close } from './icons';

const CloseContext = createContext<() => void>(() => {});

/** Closes the nearest sheet with its exit animation. */
export const useSheetClose = () => useContext(CloseContext);

const EXIT_MS = 180;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let openSheets = 0;

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Return true to block dismissal (e.g. to confirm discarding edits). */
  onBeforeDismiss?: () => Promise<boolean> | boolean;
  variant?: 'sheet' | 'alert';
}

/**
 * iOS-style bottom sheet on top of a native modal <dialog>, which provides
 * focus containment, an inert background and Escape handling for free.
 * Dismiss by tapping the scrim, the close button, Escape, or dragging the
 * grabber/header down.
 */
export function Sheet({ title, onClose, children, onBeforeDismiss, variant = 'sheet' }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current!;
    // Focus the panel, not the first input: no keyboard pops up on open and
    // the dialog never scrolls to reveal a field mid-animation.
    panelRef.current!.setAttribute('autofocus', '');
    dialog.showModal();
    dialog.scrollTop = 0;
    if (openSheets++ === 0) document.documentElement.classList.add('sheet-open');
    return () => {
      if (dialog.open) dialog.close();
      if (--openSheets === 0) document.documentElement.classList.remove('sheet-open');
    };
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), reducedMotion() ? 0 : EXIT_MS);
  }, []);

  const dismiss = useCallback(async () => {
    if (onBeforeDismiss && (await onBeforeDismiss())) {
      resetDrag();
      return;
    }
    close();
  }, [close, onBeforeDismiss]);

  // Drag-to-dismiss on the grabber/header.
  const drag = useRef<{ y: number; t: number; dy: number; id: number } | null>(null);
  const resetDrag = () => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = '';
    panel.style.transform = '';
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || variant !== 'sheet') return;
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panelRef.current!.style.transition = 'none';
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = e.clientY - d.y;
    d.dy = raw > 0 ? raw : raw / 4; // resist upward pulls
    panelRef.current!.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const velocity = d.dy / Math.max(1, e.timeStamp - d.t);
    if (d.dy > 110 || (d.dy > 24 && velocity > 0.6)) void dismiss();
    else resetDrag();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`sheet-dialog ${variant}${closing ? ' closing' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        void dismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) void dismiss();
      }}
    >
      <div ref={panelRef} className="sheet-panel" tabIndex={-1}>
        <CloseContext.Provider value={close}>
          {variant === 'sheet' ? (
            <div
              className="sheet-head"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <span className="grabber" aria-hidden="true" />
              <h2 className="sheet-title">{title}</h2>
              <button
                type="button"
                className="icon-btn small"
                aria-label="Close"
                onClick={() => void dismiss()}
              >
                <Close />
              </button>
            </div>
          ) : null}
          <div className="sheet-body">{children}</div>
        </CloseContext.Provider>
      </div>
    </dialog>
  );
}

/* ---------- Confirmation dialogs ---------- */

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise((resolve) => setPending({ ...options, resolve })),
    [],
  );
  const answer = useRef(false);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Sheet
          variant="alert"
          title={pending.title}
          onClose={() => {
            pending.resolve(answer.current);
            answer.current = false;
            setPending(null);
          }}
        >
          <ConfirmBody options={pending} onAnswer={(ok) => (answer.current = ok)} />
        </Sheet>
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmBody({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (ok: boolean) => void }) {
  const close = useSheetClose();
  return (
    <div className="alert">
      <h2 className="alert-title">{options.title}</h2>
      <p className="alert-message">{options.message}</p>
      <div className="alert-actions">
        <button type="button" className="btn secondary" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${options.destructive ? 'danger' : 'primary'}`}
          onClick={() => {
            onAnswer(true);
            close();
          }}
        >
          {options.confirmLabel}
        </button>
      </div>
    </div>
  );
}
