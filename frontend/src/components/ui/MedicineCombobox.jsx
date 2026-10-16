import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pill, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { findDrug, searchCatalog, CATALOG } from '../../data/catalog';

// Shown when the box is focused but empty, so the list is never blank.
const COMMON = ['Paracetamol', 'Amoxicillin', 'Azithromycin', 'Metformin', 'Amlodipine', 'Atorvastatin',
  'Pantoprazole', 'Cetirizine', 'Ibuprofen', 'Losartan'].map((n) => findDrug(n)).filter(Boolean);

// Names in the backend dataset / DGAT vocabulary. Loaded once and shared by every row,
// so we can tell the doctor whether a typed name is recognised by the DDI engine.
let datasetNames = null;
let datasetPromise = null;
function loadDatasetNames() {
  if (!datasetPromise) {
    datasetPromise = api.drugCatalog()
      .then((names) => { datasetNames = new Set((names || []).map((n) => String(n).toLowerCase())); })
      .catch(() => { datasetPromise = null; });
  }
  return datasetPromise;
}
export function isKnownMedicine(name) {
  const q = (name || '').trim().toLowerCase();
  return !!q && (!!findDrug(q) || !!datasetNames?.has(q));
}

function Highlight({ text, query }) {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="med-mark">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/**
 * Searchable medicine picker (replaces the native <datalist>, which renders inconsistently,
 * can't show brand/class/dose, and isn't clipped-safe inside a horizontally scrolling table).
 *  - value / onChange(text): free text is allowed (unknown medicines can still be prescribed).
 *  - onPick(drug): fired when a catalog entry is chosen, so the parent can auto-fill dose/unit.
 */
export default function MedicineCombobox({ value, onChange, onPick, disabled, invalid, title, ariaLabel, placeholder = 'Search medicine…' }) {
  const id = useId();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const [remote, setRemote] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [, force] = useState(0);

  const query = value || '';
  const q = query.trim();

  useEffect(() => { loadDatasetNames().then(() => force((n) => n + 1)); }, []);

  const local = useMemo(() => (q ? searchCatalog(q, 12) : COMMON.map((drug) => ({ drug, via: null }))), [q]);

  // Extra matches from the backend (Indian brand dataset + DGAT vocabulary), debounced.
  useEffect(() => {
    if (!open || q.length < 2) { setRemote([]); setRemoteLoading(false); return undefined; }
    let live = true;
    setRemoteLoading(true);
    const t = setTimeout(() => {
      api.searchDrugCatalog(q)
        .then((names) => { if (live) setRemote(names || []); })
        .catch(() => { if (live) setRemote([]); })
        .finally(() => { if (live) setRemoteLoading(false); });
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [q, open]);

  const options = useMemo(() => {
    const seen = new Set(local.map((o) => o.drug.name.toLowerCase()));
    CATALOG.forEach((d) => d.brands.forEach((b) => seen.add(b.toLowerCase())));
    const extra = remote.filter((n) => !seen.has(String(n).toLowerCase())).slice(0, 15)
      .map((name) => ({ name: String(name), dataset: true }));
    return [
      ...local.map((o) => ({ key: o.drug.name, name: o.drug.name, drug: o.drug, via: o.via })),
      ...extra.map((e) => ({ key: `ds:${e.name}`, name: e.name, dataset: true })),
    ];
  }, [local, remote]);

  const exact = !!q && options.some((o) => o.name.toLowerCase() === q.toLowerCase());
  const showCustom = !!q && !exact;
  const total = options.length + (showCustom ? 1 : 0);

  useEffect(() => { setActive(0); }, [q, options.length]);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 360);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(340, flip ? above : below));
    setPos({ left, width, maxHeight, ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (opt) => {
    if (opt.drug) { onChange(opt.drug.name); onPick?.(opt.drug); } else onChange(opt.name);
    setOpen(false);
  };
  const chooseIndex = (i) => {
    if (i < options.length) choose(options[i]);
    else { onChange(q); setOpen(false); }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => (a + 1) % Math.max(total, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => (a - 1 + Math.max(total, 1)) % Math.max(total, 1)); }
    else if (e.key === 'Enter' && open && total) { e.preventDefault(); chooseIndex(active); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const listId = `${id}-list`;
  const known = isKnownMedicine(value);

  return (
    <>
      <input ref={inputRef} className={`input med-input${invalid ? ' input-warn' : ''}${known ? ' med-known' : ''}`} role="combobox" aria-label={ariaLabel}
             aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && total ? `${id}-opt-${active}` : undefined}
             autoComplete="off" spellCheck={false} disabled={disabled} value={query} title={title} placeholder={placeholder}
             onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
             onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
             onChange={(e) => { onChange(e.target.value); setOpen(true); }} />
      {open && !disabled && pos && createPortal(
        <div ref={listRef} id={listId} role="listbox" className="med-pop" aria-label="Medicine suggestions"
             style={{ left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
             onMouseDown={(e) => e.preventDefault()}>
          <div className="med-pop-head">
            <Search size={12} />
            {q ? `Results for “${q}”` : 'Common medicines — start typing to search generic, brand or class'}
            {remoteLoading && <span className="med-pop-spin">searching dataset…</span>}
          </div>
          {options.map((o, i) => (
            <div key={o.key} id={`${id}-opt-${i}`} role="option" aria-selected={i === active} className={`med-opt${i === active ? ' is-active' : ''}`}
                 onMouseEnter={() => setActive(i)} onClick={() => chooseIndex(i)}>
              <Pill size={14} className="med-opt-ico" />
              <div className="med-opt-main">
                <div className="med-opt-name"><Highlight text={o.name} query={q} />
                  {o.via && o.via !== o.drug?.cls && <span className="med-opt-via">brand: <Highlight text={o.via} query={q} /></span>}
                </div>
                <div className="med-opt-sub">
                  {o.drug ? <>{o.drug.cls}{o.drug.brands.length > 0 && <> · {o.drug.brands.slice(0, 3).join(', ')}</>}</> : 'From medicine dataset'}
                </div>
              </div>
              {o.drug && <span className="med-opt-dose">{o.drug.dose}</span>}
            </div>
          ))}
          {showCustom && (
            <div id={`${id}-opt-${options.length}`} role="option" aria-selected={active === options.length}
                 className={`med-opt med-opt-custom${active === options.length ? ' is-active' : ''}`}
                 onMouseEnter={() => setActive(options.length)} onClick={() => chooseIndex(options.length)}>
              <Search size={14} className="med-opt-ico" />
              <div className="med-opt-main">
                <div className="med-opt-name">{options.length ? 'Use' : 'No match — use'} “{q}” as typed</div>
                <div className="med-opt-sub">Not in the catalog — the DDI check may not recognise this name.</div>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
