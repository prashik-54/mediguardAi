import { useId } from 'react';

const uid = (raw) => raw.replace(/[^a-zA-Z0-9]/g, '');

/** Glossy two-tone capsule. Purely decorative. */
export function Capsule({ w = 132, h = 48, a = '#2bd9b5', b = '#ffffff', rot = 0, shadow = true, style, className }) {
  const id = uid(useId());
  const r = h / 2;
  const mid = w / 2;
  return (
    <svg className={className} style={{ overflow: 'visible', transform: `rotate(${rot}deg)`, ...style }} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} stopOpacity=".95" /><stop offset="1" stopColor={a} /><stop offset="1" stopColor="#000" stopOpacity=".28" /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={b} /><stop offset=".72" stopColor={b} /><stop offset="1" stopColor="#0a2a39" stopOpacity=".28" /></linearGradient>
        <clipPath id={`${id}c`}><rect width={w} height={h} rx={r} /></clipPath>
        <filter id={`${id}s`} x="-20%" y="-40%" width="140%" height="220%"><feGaussianBlur stdDeviation={h * 0.16} /></filter>
      </defs>
      {shadow && <ellipse cx={mid} cy={h + h * 0.22} rx={w * 0.4} ry={h * 0.13} fill="#020e14" opacity=".35" filter={`url(#${id}s)`} />}
      <g clipPath={`url(#${id}c)`}>
        <rect width={mid} height={h} fill={`url(#${id}a)`} />
        <rect x={mid} width={mid} height={h} fill={`url(#${id}b)`} />
        <rect x={mid - 1.2} width="2.4" height={h} fill="#000" opacity=".12" />
        <rect x={h * 0.28} y={h * 0.12} width={w - h * 0.56} height={h * 0.2} rx={h * 0.1} fill="#fff" opacity=".5" />
        <rect x={h * 0.4} y={h * 0.7} width={w - h * 0.8} height={h * 0.08} rx={h * 0.04} fill="#fff" opacity=".18" />
      </g>
      <rect width={w} height={h} rx={r} fill="none" stroke="#fff" strokeOpacity=".28" />
    </svg>
  );
}

/** Round scored tablet. */
export function Tablet({ size = 56, color = '#ffffff', shade = '#cfe0e6', style, className }) {
  const id = uid(useId());
  const r = size / 2;
  return (
    <svg className={className} style={{ overflow: 'visible', ...style }} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}g`} cx=".35" cy=".3" r=".9"><stop offset="0" stopColor={color} /><stop offset=".7" stopColor={color} /><stop offset="1" stopColor={shade} /></radialGradient>
        <filter id={`${id}s`} x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation={size * 0.09} /></filter>
      </defs>
      <ellipse cx={r} cy={size * 1.02} rx={r * 0.8} ry={size * 0.1} fill="#020e14" opacity=".35" filter={`url(#${id}s)`} />
      <circle cx={r} cy={r} r={r} fill={`url(#${id}g)`} />
      <circle cx={r} cy={r} r={r - 0.5} fill="none" stroke="#fff" strokeOpacity=".5" />
      <path d={`M${size * 0.22} ${r}H${size * 0.78}`} stroke="#0a2a39" strokeOpacity=".16" strokeWidth={size * 0.04} strokeLinecap="round" />
      <ellipse cx={size * 0.34} cy={size * 0.24} rx={size * 0.16} ry={size * 0.08} fill="#fff" opacity=".7" transform={`rotate(-30 ${size * 0.34} ${size * 0.24})`} />
    </svg>
  );
}
