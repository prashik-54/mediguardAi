import { useId, useState } from 'react';
import { Eye, EyeOff, CircleAlert, Plus, X } from 'lucide-react';

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {error ? <span className="err" role="alert"><CircleAlert size={13} />{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Label + input wired together with a generated id. */
export function TextField({ label, hint, error, className, inputClass = '', icon: Icon, ...props }) {
  const id = useId();
  return (
    <div className={`field ${className || ''}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className={Icon ? 'input-icon' : undefined}>
        {Icon && <Icon size={16} />}
        <input id={id} className={`input ${inputClass}`} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} {...props} />
      </div>
      {error ? <span id={`${id}-msg`} className="err" role="alert"><CircleAlert size={13} />{error}</span> : hint ? <span id={`${id}-msg`} className="hint">{hint}</span> : null}
    </div>
  );
}

export function SelectField({ label, hint, error, options, className, placeholder, ...props }) {
  const id = useId();
  return (
    <div className={`field ${className || ''}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} className="select" aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      {error ? <span id={`${id}-msg`} className="err" role="alert"><CircleAlert size={13} />{error}</span> : hint ? <span id={`${id}-msg`} className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextAreaField({ label, hint, error, className, ...props }) {
  const id = useId();
  return (
    <div className={`field ${className || ''}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <textarea id={id} className="textarea" aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} {...props} />
      {error ? <span id={`${id}-msg`} className="err" role="alert"><CircleAlert size={13} />{error}</span> : hint ? <span id={`${id}-msg`} className="hint">{hint}</span> : null}
    </div>
  );
}

export function PasswordField({ label = 'Password', error, hint, className, ...props }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className={`field ${className || ''}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="input-icon">
        <input id={id} className="input" style={{ paddingLeft: 12, paddingRight: 42 }} type={show ? 'text' : 'password'} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} {...props} />
        <span className="trail">
          <button type="button" className="icon-btn plain" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </span>
      </div>
      {error ? <span id={`${id}-msg`} className="err" role="alert"><CircleAlert size={13} />{error}</span> : hint ? <span id={`${id}-msg`} className="hint">{hint}</span> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <span className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="track" />
    </span>
  );
}

/** Tag/chip editor with a suggestion dropdown — type-to-search a known value or add
 * a free-text one, Enter or the Add button commits it as a removable chip. Shared by
 * every place that collects conditions/allergies/etc. so the same suggestion-driven
 * pattern (used at patient registration) also appears during consultation. */
export function ChipInput({ items, onAdd, onRemove, placeholder, suggestions = [], listId, disabled = false }) {
  const genId = useId();
  const id = listId || `chip-suggest-${genId}`;
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) onAdd(t); setV(''); };
  return (
    <div className="grid" style={{ gap: 10 }}>
      {!disabled && (
        <div className="row gap-8">
          <input className="input" list={id} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <datalist id={id}>{suggestions.filter((s) => !items.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
          <button type="button" className="btn btn-outline" onClick={add}><Plus size={15} />Add</button>
        </div>
      )}
      {items.length > 0 ? <div className="chips">{items.map((c) => <span className="chip-x" key={c}>{c}{!disabled && <button type="button" aria-label={`Remove ${c}`} onClick={() => onRemove(c)}><X size={12} /></button>}</span>)}</div>
        : disabled && <p className="muted small">None recorded.</p>}
    </div>
  );
}

/** Small clickable suggestion pills that append their text into a free-text field
 * (e.g. Diagnosis, Follow-up instructions) instead of forcing the doctor to type
 * common phrasing from scratch. */
export function SuggestionChips({ options = [], onPick, label = 'Quick add' }) {
  if (!options.length) return null;
  return (
    <div className="row gap-6 wrap mb-6" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o} className="chip-suggest-btn" onClick={() => onPick(o)}>+ {o}</button>
      ))}
    </div>
  );
}

export function passwordStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}
