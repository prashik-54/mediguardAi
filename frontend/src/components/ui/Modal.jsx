import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [onClose]);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Autofocus the first field, keep Tab inside the dialog and give focus back to the opener on close. */
function useAutofocus(ref) {
  useEffect(() => {
    const opener = document.activeElement;
    const el = ref.current;
    el?.querySelector('input,select,textarea,button:not([aria-label="Close"])')?.focus?.();
    const trap = (e) => {
      if (e.key !== 'Tab' || !el) return;
      const nodes = [...el.querySelectorAll(FOCUSABLE)];
      if (!nodes.length) return;
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (opener instanceof HTMLElement && document.contains(opener)) opener.focus(); };
  }, [ref]);
}

export function Modal({ title, subtitle, onClose, children, footer, size }) {
  const ref = useRef(null);
  useEscape(onClose);
  useAutofocus(ref);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size === 'sm' ? 'modal-sm' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p className="muted small mt-4">{subtitle}</p>}</div>
          <button className="icon-btn plain" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ title, onClose, children, footer, headExtra }) {
  const ref = useRef(null);
  useEscape(onClose);
  useAutofocus(ref);
  return createPortal(
    <div className="overlay drawer-host" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="drawer-head">
          <h2 style={{ fontSize: 16 }}>{title}</h2>
          <div className="row gap-8">{headExtra}<button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></div>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Confirmation for irreversible / high-impact actions. Waits for an async onConfirm and blocks double-submits. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); onClose(); }
  };
  return (
    <Modal title={title} size="sm" onClose={busy ? () => {} : onClose} footer={<>
      <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={go} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
    </>}>
      <p className="muted">{message}</p>
    </Modal>
  );
}
