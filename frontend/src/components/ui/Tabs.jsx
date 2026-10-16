export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  const ids = tabs.map((t) => (typeof t === 'string' ? t : t.id));
  const onKey = (e) => {
    const i = ids.indexOf(value);
    const next = e.key === 'ArrowRight' ? (i + 1) % ids.length : e.key === 'ArrowLeft' ? (i - 1 + ids.length) % ids.length : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    onChange(ids[next]);
    e.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => {
        const id = typeof t === 'string' ? t : t.id;
        const text = typeof t === 'string' ? t : t.label;
        return <button key={id} role="tab" className="tab" aria-selected={value === id} tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)}>{text}</button>;
      })}
    </div>
  );
}
