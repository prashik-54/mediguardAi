import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { initials } from '../../lib/format';
import { EmptyArt } from '../art/Spots';

const AV = [['#1bb8a6', '#0a6a78'], ['#5aa9ff', '#3563e9'], ['#8b7cf6', '#5b47d6'], ['#f4b23f', '#d9822b'], ['#ff7d8c', '#d4304a'], ['#38c9a0', '#0c7d5f']];
const hash = (str = '') => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Initials avatar with a stable, name-derived gradient from the brand palette. */
export function Avatar({ name, size, className = '' }) {
  const [a, b] = AV[hash(name) % AV.length];
  return <span className={`avatar ${size ? `avatar-${size}` : ''} ${className}`} style={{ '--av-a': a, '--av-b': b }} aria-hidden="true">{initials(name)}</span>;
}

const TONES = {
  teal: ['var(--primary)', 'linear-gradient(140deg, #e9f7f8, #cdeaed)', 'rgba(43,217,181,.18)', '#2bd9b5'],
  high: ['var(--high)', 'linear-gradient(140deg, #fff1f3, #fdd5db)', 'rgba(255,107,122,.2)', '#ff6b7a'],
  moderate: ['var(--mod)', 'linear-gradient(140deg, #fff6e5, #fde3b0)', 'rgba(244,178,63,.22)', '#f4b23f'],
  low: ['var(--low)', 'linear-gradient(140deg, #e8faf2, #c4efdc)', 'rgba(12,148,104,.16)', '#0c9468'],
  info: ['var(--info)', 'linear-gradient(140deg, #eef3ff, #d3e0ff)', 'rgba(90,169,255,.22)', '#5aa9ff'],
};
export function IconTile({ icon: Icon, tone = 'teal', size = 40 }) {
  const [fg, bg] = TONES[tone] || TONES.teal;
  return <span className="icon-tile" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: bg, color: fg }}><Icon size={size * 0.48} /></span>;
}

/** Deterministic little trend line for stat cards (decorative). */
function Spark({ seed, color, up = true }) {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const n = Math.sin(seed * 12.9898 + i * 4.1) * 43758.5453; const r = n - Math.floor(n);
    const base = up ? i * 1.6 : (8 - i) * 0.6;
    return 24 - (base + r * 5);
  });
  const min = Math.min(...pts); const max = Math.max(...pts);
  const y = (v) => 4 + ((v - min) / (max - min || 1)) * 22;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i * 72) / 7} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="stat-spark" width="72" height="30" viewBox="0 0 72 30" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="72" cy={y(pts[7])} r="3" fill={color} />
    </svg>
  );
}

export function StatCard({ icon, tone = 'teal', label, value, delta, deltaTone, note, onClick }) {
  const up = delta && !String(delta).startsWith('-');
  const t = TONES[tone] || TONES.teal;
  const seed = [...String(label)].reduce((h, c) => h + c.charCodeAt(0), 0);
  return (
    <div className={`card card-pad stat ${onClick ? 'clickable' : ''}`} onClick={onClick} style={{ '--stat-glow': t[2] }} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}>
      <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
        <IconTile icon={icon} tone={tone} size={44} />
        <div className="grow">
          <div className="muted small strong">{label}</div>
          <div className="stat-value mono">{value}</div>
          {delta && <div className="small strong row gap-4" style={{ color: deltaTone === 'bad' ? 'var(--high)' : 'var(--low)' }}>{up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{delta}</div>}
          {note && <div className="small strong" style={{ color: tone === 'high' ? 'var(--high)' : 'var(--muted)' }}>{note}</div>}
        </div>
      </div>
      {delta && <Spark seed={seed} color={t[3]} up={up} />}
    </div>
  );
}

export function PageHead({ title, subtitle, children, breadcrumbs }) {
  return (
    <>
      {breadcrumbs && <nav className="breadcrumbs mb-8" aria-label="Breadcrumb">{breadcrumbs}</nav>}
      <div className="page-head">
        <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
        {children && <div className="page-actions">{children}</div>}
      </div>
    </>
  );
}

export function EmptyState({ icon: Icon, title, children, action, art = true }) {
  return (
    <div className="empty">
      {art ? <EmptyArt /> : Icon && <div className="ring"><Icon size={24} /></div>}
      <h3>{title}</h3>
      {children && <p style={{ maxWidth: 360, margin: '0 auto' }}>{children}</p>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

/** Props that make a clickable table row / card keyboard-operable (Enter or Space opens it). */
export const rowProps = (onOpen) => ({
  onClick: onOpen,
  tabIndex: 0,
  onKeyDown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(); } },
});

/** Shared loading placeholder (announced to screen readers). */
export function LoadingState({ label = 'Loading…', rows = 3 }) {
  return (
    <div className="state-box" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 14, width: `${92 - i * 14}%` }} />)}
    </div>
  );
}

/** Shared failure state: a failed request must never look like an empty list. */
export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="state-box state-error" role="alert">
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {onRetry && <button className="btn btn-outline btn-sm mt-8" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage, label = 'patients' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [];
  const push = (n) => { if (!nums.includes(n) && n >= 1 && n <= pages) nums.push(n); };
  [1, page - 1, page, page + 1, pages].forEach(push);
  nums.sort((a, b) => a - b);
  return (
    <div className="pager">
      <span>Showing {from}–{to} of {total} {label}</span>
      <div className="pages" role="navigation" aria-label="Pagination">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={14} /></button>
        {nums.map((n, i) => (
          <span key={n} style={{ display: 'contents' }}>
            {i > 0 && n - nums[i - 1] > 1 && <span style={{ alignSelf: 'center', padding: '0 2px' }}>…</span>}
            <button onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
          </span>
        ))}
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

/** Popover menu rendered in a portal (so table/overflow containers never clip it).
 *  Closes on outside click, Escape, scroll or resize. */
export function Popover({ trigger, children, align = 'right' }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const close = () => setPos(null);
  const toggle = () => {
    if (pos) return close();
    const r = ref.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setPos({ top: r.bottom + 6, bottom: null, right: window.innerWidth - r.right, left: r.left, flip: below < 260 && r.top > below, rTop: r.top });
  };
  useEffect(() => {
    if (!pos) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target) && !menuRef.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [pos]);
  const style = pos && {
    position: 'fixed', zIndex: 150, ...(pos.flip ? { top: 'auto', bottom: window.innerHeight - pos.rTop + 6 } : { top: pos.top }),
    ...(align === 'left' ? { right: 'auto', left: Math.max(8, Math.min(pos.left, window.innerWidth - 300)) } : { right: pos.right }),
  };
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {trigger({ open: !!pos, toggle })}
      {pos && createPortal(<div ref={menuRef} className="menu" style={style} onClick={(e) => { if (e.target.closest('button,a')) close(); }}>{children}</div>, document.body)}
    </div>
  );
}

export function Sparkbar({ value, max = 100, tone = 'var(--accent)' }) {
  return <div className="progress"><i style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: tone }} /></div>;
}
