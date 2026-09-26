import { useId } from 'react';

const uid = (raw) => raw.replace(/[^a-zA-Z0-9]/g, '');

/* Flat, faceless bust illustrations — one per role. Original artwork. */
const SPEC = {
  doctor: {
    bg: ['#bff3e8', '#5fd0c0'], skin: '#b9784a', skinShade: '#a5673c', hair: '#1c1512', coat: '#ffffff', coatShade: '#dbe8ec', inner: '#0a6a78',
    hairPath: 'M40 52c-2-16 8-27 21-27s23 9 20 26c-3-7-8-10-14-11-9 4-19 3-27 12Z', extra: 'long',
  },
  pharmacist: {
    bg: ['#d9e6ff', '#8fb3ff'], skin: '#c88a5b', skinShade: '#b47846', hair: '#241a14', coat: '#ffffff', coatShade: '#d9e4ea', inner: '#0e9f7e',
    hairPath: 'M41 50c-1-14 8-24 20-24 12 0 21 8 19 24-3-5-6-8-11-9-8 3-19 2-28 9Z', extra: 'badge',
  },
  patient: {
    bg: ['#ffe9c7', '#f7c26a'], skin: '#d09a6b', skinShade: '#bc8657', hair: '#3a2a20', coat: '#0a6a78', coatShade: '#08535f', inner: '#0a6a78',
    hairPath: 'M41 50c-2-13 8-23 20-23 12 0 21 8 19 23-2-4-5-7-10-8-8 3-20 2-29 8Z', extra: 'tee',
  },
  administrator: {
    bg: ['#e4dcff', '#a99bf5'], skin: '#b57446', skinShade: '#a16438', hair: '#150f0d', coat: '#1c3b52', coatShade: '#132c40', inner: '#f5f8fa',
    hairPath: 'M41 50c-3-16 7-27 20-27 13 0 22 10 19 27-3-8-8-12-14-12-8 3-17 3-25 12Z', extra: 'bun',
  },
  admin: {
    bg: ['#ece7de', '#c9bd9e'], skin: '#a5673c', skinShade: '#8f5730', hair: '#211a16', coat: '#2b2621', coatShade: '#1c1815', inner: '#d8ad4e',
    hairPath: 'M41 50c-3-15 7-26 20-26 13 0 22 9 19 26-3-7-8-11-14-11-8 3-17 3-25 11Z', extra: 'badge',
  },
};

export default function Portrait({ role = 'doctor', size = 64, ring = false, className, style }) {
  const s = SPEC[role] || SPEC.doctor;
  const id = uid(useId());
  return (
    <svg className={className} style={{ borderRadius: '50%', flexShrink: 0, boxShadow: ring ? '0 0 0 2px #fff, 0 0 0 4px rgba(10,106,120,.25)' : undefined, ...style }} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={s.bg[0]} /><stop offset="1" stopColor={s.bg[1]} /></linearGradient>
        <clipPath id={`${id}c`}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="120" height="120" fill={`url(#${id}bg)`} />
        <circle cx="96" cy="26" r="30" fill="#fff" opacity=".22" />
        <circle cx="12" cy="98" r="26" fill="#fff" opacity=".16" />
        {s.extra === 'bun' && <circle cx="60" cy="24" r="10" fill={s.hair} />}
        {s.extra === 'long' && <path d="M38 50c-4 22-1 36 8 46l14-8V52Z M82 50c4 22 1 36-8 46l-14-8V52Z" fill={s.hair} />}
        {/* shoulders */}
        <path d="M8 124c0-27 22-40 52-40s52 13 52 40Z" fill={s.coat} />
        <path d="M8 124c0-27 22-40 52-40 6 0 12 .6 17 1.8C60 92 40 104 38 124Z" fill={s.coatShade} opacity=".55" />
        {/* neck */}
        <path d="M50 70h20v18c0 6-4 10-10 10s-10-4-10-10Z" fill={s.skinShade} />
        {/* inner garment / lapels */}
        {s.extra === 'tee' ? (
          <path d="M48 88c3 7 8 10 12 10s9-3 12-10c-4-2-8-3-12-3s-8 1-12 3Z" fill={s.skinShade} />
        ) : (
          <>
            <path d="M44 86l16 30 16-30-6-3-10 14-10-14Z" fill={s.inner} />
            <path d="M44 86l16 30-24 8Z M76 86L60 116l24 8Z" fill={s.coat} />
            <path d="M44 86l16 30M76 86L60 116" stroke={s.coatShade} strokeWidth="1.5" fill="none" />
          </>
        )}
        {s.extra === 'badge' && <rect x="76" y="100" width="14" height="9" rx="2" fill={role === 'admin' ? '#d8ad4e' : '#0e9f7e'} stroke="#fff" strokeWidth="1.2" />}
        {(role === 'doctor') && (
          <g fill="none" stroke="#3f5a68" strokeWidth="2.4" strokeLinecap="round">
            <path d="M46 84c-4 12-2 22 6 26 4 2 8 0 9-4" />
            <path d="M74 84c4 12 2 22-6 26" />
            <circle cx="62" cy="108" r="4" fill="#c8d6dc" stroke="#3f5a68" strokeWidth="2" />
          </g>
        )}
        {/* head */}
        <ellipse cx="60" cy="56" rx="19" ry="22" fill={s.skin} />
        <ellipse cx="41.5" cy="58" rx="3.2" ry="5" fill={s.skinShade} />
        <ellipse cx="78.5" cy="58" rx="3.2" ry="5" fill={s.skinShade} />
        <path d={s.hairPath} fill={s.hair} />
        {/* quiet facial cues */}
        <path d="M54 68c3.5 2.6 8.5 2.6 12 0" stroke="#5a2f19" strokeOpacity=".55" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <circle cx="53" cy="57" r="1.6" fill="#2a1a12" opacity=".75" />
        <circle cx="67" cy="57" r="1.6" fill="#2a1a12" opacity=".75" />
        <ellipse cx="49.5" cy="63" rx="3.4" ry="2" fill="#ff8a7a" opacity=".22" />
        <ellipse cx="70.5" cy="63" rx="3.4" ry="2" fill="#ff8a7a" opacity=".22" />
      </g>
    </svg>
  );
}
