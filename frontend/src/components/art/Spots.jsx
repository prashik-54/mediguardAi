import { useId } from 'react';

const uid = (raw) => raw.replace(/[^a-zA-Z0-9]/g, '');
const TINTS = {
  mint: ['#e6f9f4', '#c9eef0', '#2bd9b5'],
  sky: ['#eaf2ff', '#cfe0ff', '#5aa9ff'],
  violet: ['#f0ecff', '#dcd4ff', '#8b7cf6'],
  amber: ['#fff4e0', '#ffe2ae', '#f4b23f'],
  coral: ['#ffeff1', '#ffd8de', '#ff6b7a'],
};
const F = { fontFamily: 'var(--font-display)' };

/** Shared frame: tinted panel with soft highlights and a drop-shadow filter for white "UI fragment" cards. */
function Frame({ tint = 'mint', w = 280, h = 160, children, label, className }) {
  const id = uid(useId());
  const [c1, c2, c3] = TINTS[tint];
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} width="100%" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ display: 'block' }} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
        <radialGradient id={`${id}h`} cx=".85" cy=".1" r=".7"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#0a2a39" floodOpacity=".16" /></filter>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={c3} /><stop offset="1" stopColor="#0a6a78" /></linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff9aa5" /><stop offset="1" stopColor="#d4304a" /></linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}p)`} />
      <rect width={w} height={h} fill={`url(#${id}h)`} />
      <circle cx={w * 0.08} cy={h * 1.05} r={h * 0.55} fill="#fff" opacity=".35" />
      {children({ shadow: `url(#${id}s)`, accent: `url(#${id}a)`, red: `url(#${id}r)`, c3, id })}
    </svg>
  );
}

/* ---------------- Feature spots ---------------- */
export function SpotRisk() {
  return (
    <Frame tint="mint" label="Risk score gauge">
      {({ shadow, id, red }) => (
        <>
          <rect x="66" y="22" width="148" height="112" rx="16" fill="#fff" filter={shadow} />
          <path d="M96 106a44 44 0 0 1 88 0" fill="none" stroke="#e3eef1" strokeWidth="10" strokeLinecap="round" />
          <path d="M96 106a44 44 0 0 1 82-22" fill="none" stroke={`url(#${id}a)`} strokeWidth="10" strokeLinecap="round" />
          <path d="M178 84a44 44 0 0 1 6 22" fill="none" stroke="#ff6b7a" strokeWidth="10" strokeLinecap="round" />
          <text x="140" y="104" textAnchor="middle" fontSize="26" fontWeight="800" fill="#0a1f29" style={F}>92</text>
          <text x="140" y="118" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#5f7784">patient-adjusted</text>
          <rect x="28" y="46" width="52" height="22" rx="11" fill="#fff" filter={shadow} />
          <circle cx="40" cy="57" r="4" fill="#2bd9b5" /><rect x="49" y="54" width="25" height="6" rx="3" fill="#c4d6dc" />
          <rect x="200" y="84" width="56" height="22" rx="11" fill="#fff" filter={shadow} />
          <circle cx="212" cy="95" r="4" fill="#ff6b7a" /><rect x="221" y="92" width="29" height="6" rx="3" fill="#c4d6dc" />
        </>
      )}
    </Frame>
  );
}

export function SpotExplain() {
  return (
    <Frame tint="sky" label="Explanation bars">
      {({ shadow, red, accent }) => (
        <>
          <rect x="34" y="24" width="182" height="112" rx="16" fill="#fff" filter={shadow} />
          {[[0, 128, true], [1, 62], [2, 40], [3, 30]].map(([i, len, hot]) => (
            <g key={i} transform={`translate(52 ${44 + i * 22})`}>
              <rect width="34" height="7" rx="3.5" fill="#d5e2e7" />
              <rect x="44" width="124" height="9" rx="4.5" fill="#edf3f5" />
              <rect x="44" width={len} height="9" rx="4.5" fill={hot ? red : accent} />
            </g>
          ))}
          <g transform="translate(196 92)">
            <circle r="26" fill="#fff" fillOpacity=".85" stroke="#0a6a78" strokeWidth="5" filter={shadow} />
            <path d="m18 18 20 20" stroke="#0a6a78" strokeWidth="7" strokeLinecap="round" />
            <path d="m-9 0 6 6 12-13" fill="none" stroke="#0c9468" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </>
      )}
    </Frame>
  );
}

export function SpotPatients() {
  return (
    <Frame tint="violet" label="Patient profile cards">
      {({ shadow }) => (
        <>
          <rect x="82" y="16" width="150" height="100" rx="14" fill="#fff" opacity=".7" transform="rotate(5 157 66)" />
          <rect x="40" y="26" width="168" height="112" rx="16" fill="#fff" filter={shadow} />
          <circle cx="68" cy="56" r="16" fill="#8b7cf6" /><circle cx="68" cy="52" r="6" fill="#fff" opacity=".9" /><path d="M56 68c2-8 22-8 24 0" fill="#fff" opacity=".9" />
          <rect x="92" y="46" width="62" height="8" rx="4" fill="#0a1f29" opacity=".82" />
          <rect x="92" y="61" width="42" height="6" rx="3" fill="#c4d6dc" />
          <rect x="164" y="44" width="34" height="16" rx="8" fill="#ffe0e4" /><circle cx="173" cy="52" r="3" fill="#d4304a" />
          <path d="M54 118l20-14 18 8 22-20 20 10 24-18" fill="none" stroke="#8b7cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="178" cy="90" r="4.5" fill="#fff" stroke="#8b7cf6" strokeWidth="3" />
          {[0, 1, 2].map((i) => <rect key={i} x={56 + i * 40} y="80" width="32" height="10" rx="5" fill={['#dcd4ff', '#c9eef0', '#ffe2ae'][i]} />)}
        </>
      )}
    </Frame>
  );
}

export function SpotSecure() {
  return (
    <Frame tint="amber" label="Secure access">
      {({ shadow }) => (
        <>
          <g fill="none" stroke="#f4b23f" strokeOpacity=".6" strokeWidth="1.8" strokeDasharray="3 6" strokeLinecap="round">
            <path d="M52 40 108 76" /><path d="M46 84h62" /><path d="M52 128 108 92" />
          </g>
          {[40, 84, 128].map((y, i) => (
            <g key={y}><circle cx="44" cy={y} r="15" fill="#fff" filter={shadow} /><circle cx="44" cy={y - 3} r="5" fill={['#2bd9b5', '#5aa9ff', '#8b7cf6'][i]} /><path d={`M34 ${y + 9}c2-7 18-7 20 0`} fill={['#2bd9b5', '#5aa9ff', '#8b7cf6'][i]} /></g>
          ))}
          <path d="M170 24 118 44v40c0 30 22 50 52 60 30-10 52-30 52-60V44Z" fill="#fff" filter={shadow} />
          <path d="M170 34 128 50v34c0 24 17 40 42 49 25-9 42-25 42-49V50Z" fill="#0a6a78" />
          <path d="M170 34 128 50v34c0 24 17 40 42 49V34Z" fill="#fff" opacity=".1" />
          <path d="m151 86 14 14 26-30" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="translate(214 108)"><rect x="-17" y="-4" width="34" height="26" rx="7" fill="#0a1f29" filter={shadow} /><path d="M-8-4v-7a8 8 0 0 1 16 0v7" fill="none" stroke="#0a1f29" strokeWidth="4.5" /><circle cy="9" r="3.5" fill="#f4b23f" /></g>
        </>
      )}
    </Frame>
  );
}

/* ---------------- Step spots ---------------- */
export function StepRegister() {
  return (
    <Frame tint="sky" w={240} h={140} label="Register the patient">
      {({ shadow }) => (
        <>
          <rect x="30" y="18" width="150" height="104" rx="14" fill="#fff" filter={shadow} />
          {[0, 1, 2].map((i) => (<g key={i} transform={`translate(46 ${34 + i * 26})`}><rect width="30" height="6" rx="3" fill="#c4d6dc" /><rect y="10" width="118" height="9" rx="4.5" fill="#edf3f5" /></g>))}
          <rect x="46" y="44" width="70" height="9" rx="4.5" fill="#5aa9ff" opacity=".55" />
          <circle cx="178" cy="40" r="22" fill="#0a6a78" filter={shadow} />
          <path d="M178 30v20M168 40h20" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        </>
      )}
    </Frame>
  );
}
export function StepMeds() {
  return (
    <Frame tint="mint" w={240} h={140} label="Add medications">
      {({ shadow }) => (
        <>
          <rect x="24" y="18" width="164" height="30" rx="15" fill="#fff" filter={shadow} />
          <circle cx="44" cy="33" r="6" fill="none" stroke="#5f7784" strokeWidth="2.4" /><path d="m49 38 5 5" stroke="#5f7784" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="62" y="30" width="60" height="7" rx="3.5" fill="#c4d6dc" />
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(24 ${60 + i * 34})`}>
              <rect width="192" height="28" rx="10" fill="#fff" filter={shadow} />
              <g transform="translate(20 14) rotate(-35)"><rect x="-11" y="-5" width="22" height="10" rx="5" fill={i ? '#5aa9ff' : '#2bd9b5'} /><rect x="0" y="-5" width="11" height="10" rx="5" fill="#fff" stroke="#d9e6ea" /><rect x="-3" y="-5" width="6" height="10" fill={i ? '#5aa9ff' : '#2bd9b5'} /></g>
              <rect x="42" y="8" width={i ? 64 : 82} height="6" rx="3" fill="#0a1f29" opacity=".75" /><rect x="42" y="17" width="44" height="4" rx="2" fill="#c4d6dc" />
              <rect x="150" y="6" width="34" height="16" rx="8" fill="#e2f8ef" /><path d="m160 14 4 4 8-8" fill="none" stroke="#0c9468" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
        </>
      )}
    </Frame>
  );
}
export function StepAnalyze() {
  return (
    <Frame tint="coral" w={240} h={140} label="Run the analysis">
      {({ shadow }) => (
        <>
          <g fill="none" stroke="#ff6b7a" strokeOpacity=".28"><circle cx="120" cy="72" r="26" /><circle cx="120" cy="72" r="46" /><circle cx="120" cy="72" r="66" strokeDasharray="3 6" /></g>
          <path d="M62 72 178 72" stroke="#ff6b7a" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="1 9" />
          <g transform="translate(58 72)"><circle r="24" fill="#fff" filter={shadow} /><g transform="rotate(-35)"><rect x="-13" y="-6" width="26" height="12" rx="6" fill="#2bd9b5" /><rect x="0" y="-6" width="13" height="12" rx="6" fill="#fff" stroke="#d9e6ea" /><rect x="-3" y="-6" width="6" height="12" fill="#2bd9b5" /></g></g>
          <g transform="translate(182 72)"><circle r="24" fill="#fff" filter={shadow} /><g transform="rotate(30)"><rect x="-13" y="-6" width="26" height="12" rx="6" fill="#8b7cf6" /><rect x="0" y="-6" width="13" height="12" rx="6" fill="#fff" stroke="#d9e6ea" /><rect x="-3" y="-6" width="6" height="12" fill="#8b7cf6" /></g></g>
          <circle cx="120" cy="72" r="17" fill="#d4304a" filter={shadow} /><path d="M120 64v9" stroke="#fff" strokeWidth="3" strokeLinecap="round" /><circle cx="120" cy="80" r="1.9" fill="#fff" />
        </>
      )}
    </Frame>
  );
}
export function StepReport() {
  return (
    <Frame tint="violet" w={240} h={140} label="Review and export a report">
      {({ shadow }) => (
        <>
          <rect x="52" y="14" width="126" height="116" rx="12" fill="#fff" filter={shadow} />
          <rect x="66" y="28" width="52" height="8" rx="4" fill="#0a1f29" opacity=".8" /><rect x="66" y="42" width="84" height="5" rx="2.5" fill="#c4d6dc" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={66 + i * 19} y={104 - [22, 34, 18, 44, 28][i]} width="12" height={[22, 34, 18, 44, 28][i]} rx="4" fill={i === 3 ? '#ff6b7a' : '#8b7cf6'} opacity={i === 3 ? 1 : 0.75} />)}
          <rect x="66" y="108" width="84" height="3" rx="1.5" fill="#e3eef1" />
          <g transform="translate(176 96)"><circle r="24" fill="#0c9468" filter={shadow} /><path d="m-11 1 8 8 15-17" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" /></g>
        </>
      )}
    </Frame>
  );
}

/* ---------------- Illustrations for banners / empty / 404 ---------------- */
export function BannerArt() {
  const id = uid(useId());
  return (
    <svg className="banner-art" viewBox="0 0 420 200" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7df0d8" stopOpacity="0" /><stop offset=".5" stopColor="#7df0d8" /><stop offset="1" stopColor="#7df0d8" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}c1`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5ff0d0" /><stop offset="1" stopColor="#11a88c" /></linearGradient>
      </defs>
      <g fill="none" stroke="#fff" strokeOpacity=".1"><circle cx="300" cy="100" r="60" /><circle cx="300" cy="100" r="96" strokeDasharray="3 7" /><circle cx="300" cy="100" r="140" /></g>
      <path className="banner-ecg" d="M10 150h110l12-22 20 48 22-72 20 58 12-12h214" fill="none" stroke={`url(#${id}e)`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(300 96) rotate(-24)">
        <rect x="-62" y="-22" width="124" height="44" rx="22" fill={`url(#${id}c1)`} />
        <rect x="0" y="-22" width="62" height="44" rx="22" fill="#fff" />
        <rect x="-8" y="-22" width="16" height="44" fill={`url(#${id}c1)`} />
        <rect x="-46" y="-16" width="84" height="8" rx="4" fill="#fff" opacity=".4" />
      </g>
      <g transform="translate(372 50) rotate(20)"><rect x="-32" y="-12" width="64" height="24" rx="12" fill="#ff6b7a" /><rect x="0" y="-12" width="32" height="24" rx="12" fill="#ffe7ea" /><rect x="-5" y="-12" width="10" height="24" fill="#ff6b7a" /></g>
      <circle cx="238" cy="160" r="18" fill="#fff" opacity=".92" /><path d="M226 160h24" stroke="#0a2a39" strokeOpacity=".15" strokeWidth="2" strokeLinecap="round" />
      <g fill="#7df0d8" opacity=".9"><circle cx="200" cy="44" r="4" /><circle cx="228" cy="62" r="2.6" /><circle cx="176" cy="70" r="2.2" /></g>
      <path d="M200 44 228 62M200 44 176 70" stroke="#7df0d8" strokeOpacity=".6" strokeWidth="1.2" />
    </svg>
  );
}

export function EmptyArt({ tone = 'mint' }) {
  const id = uid(useId());
  return (
    <svg className="empty-art" viewBox="0 0 200 140" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={TINTS[tone][0]} /><stop offset="1" stopColor={TINTS[tone][1]} /></linearGradient>
        <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0a2a39" floodOpacity=".16" /></filter>
      </defs>
      <ellipse cx="100" cy="72" rx="86" ry="60" fill={`url(#${id}g)`} />
      <g filter={`url(#${id}s)`}><rect x="58" y="22" width="84" height="100" rx="12" fill="#fff" /></g>
      <rect x="84" y="15" width="32" height="14" rx="7" fill="#0a6a78" />
      {[0, 1, 2].map((i) => (<g key={i} transform={`translate(72 ${46 + i * 22})`}><circle cx="6" cy="6" r="6" fill={i === 0 ? '#2bd9b5' : '#e3eef1'} />{i === 0 && <path d="m3 6 2.4 2.4L9.5 4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}<rect x="18" y="2" width={i === 1 ? 32 : 42} height="4" rx="2" fill="#0a1f29" opacity=".7" /><rect x="18" y="9" width="24" height="3.5" rx="1.7" fill="#c4d6dc" /></g>))}
      <g transform="translate(150 104) rotate(-28)"><rect x="-20" y="-8" width="40" height="16" rx="8" fill="#5aa9ff" /><rect x="0" y="-8" width="20" height="16" rx="8" fill="#fff" stroke="#d9e6ea" /><rect x="-4" y="-8" width="8" height="16" fill="#5aa9ff" /></g>
    </svg>
  );
}

export function NotFoundArt() {
  const id = uid(useId());
  return (
    <svg viewBox="0 0 360 200" className="nf-art" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#48e6c4" /><stop offset="1" stopColor="#0d8f80" /></linearGradient>
        <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#0a2a39" floodOpacity=".22" /></filter>
      </defs>
      <ellipse cx="180" cy="184" rx="130" ry="10" fill="#0a2a39" opacity=".1" />
      <g filter={`url(#${id}s)`}>
        <g transform="translate(124 100) rotate(-16)"><path d="M-70-30h70v60h-70a30 30 0 0 1 0-60Z" fill={`url(#${id}a)`} /><rect x="-64" y="-22" width="58" height="8" rx="4" fill="#fff" opacity=".4" /></g>
        <g transform="translate(240 104) rotate(14)"><path d="M0-30h70a30 30 0 0 1 0 60H0Z" fill="#fff" stroke="#d3e2e7" /><rect x="8" y="-22" width="52" height="8" rx="4" fill="#fff" /></g>
      </g>
      <text x="182" y="112" textAnchor="middle" fontSize="60" fontWeight="800" fill="#0a2a39" style={{ fontFamily: 'var(--font-display)' }}>404</text>
      <g fill="#2bd9b5"><circle cx="70" cy="40" r="4" /><circle cx="300" cy="46" r="3" /><circle cx="52" cy="150" r="2.5" /><circle cx="316" cy="150" r="4" /></g>
    </svg>
  );
}

export function CtaArt() {
  return (
    <svg className="cta-art" viewBox="0 0 320 200" aria-hidden="true">
      <g fill="none" stroke="#fff" strokeOpacity=".12"><circle cx="220" cy="100" r="60" /><circle cx="220" cy="100" r="98" strokeDasharray="3 7" /></g>
      <g transform="translate(210 96) rotate(-22)"><rect x="-70" y="-24" width="140" height="48" rx="24" fill="#2bd9b5" /><rect x="0" y="-24" width="70" height="48" rx="24" fill="#fff" /><rect x="-9" y="-24" width="18" height="48" fill="#2bd9b5" /><rect x="-52" y="-18" width="96" height="9" rx="4.5" fill="#fff" opacity=".4" /></g>
      <g transform="translate(270 40) rotate(18)"><rect x="-34" y="-13" width="68" height="26" rx="13" fill="#ff6b7a" /><rect x="0" y="-13" width="34" height="26" rx="13" fill="#ffe7ea" /><rect x="-6" y="-13" width="12" height="26" fill="#ff6b7a" /></g>
      <circle cx="160" cy="160" r="20" fill="#fff" opacity=".9" /><path d="M148 160h24" stroke="#0a2a39" strokeOpacity=".15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
