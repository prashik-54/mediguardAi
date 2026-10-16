import { useId } from 'react';

const uid = (raw) => raw.replace(/[^a-zA-Z0-9]/g, '');

const NODES = [
  { id: 'W', label: 'Warfarin', x: 132, y: 150, hot: true, hue: '#ff6b7a' },
  { id: 'A', label: 'Aspirin', x: 420, y: 118, hot: true, hue: '#ff6b7a' },
  { id: 'O', label: 'Omeprazole', x: 300, y: 262, hue: '#2bd9b5' },
  { id: 'M', label: 'Metformin', x: 486, y: 300, hue: '#5aa9ff' },
  { id: 'T', label: 'Atorvastatin', x: 130, y: 350, hue: '#8b7cf6' },
  { id: 'L', label: 'Amlodipine', x: 350, y: 430, hue: '#f4b23f' },
];
const EDGES = [['W', 'O'], ['A', 'O'], ['O', 'M'], ['O', 'T'], ['T', 'L'], ['O', 'L'], ['M', 'L'], ['W', 'T']];
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Hero illustration: a network of drugs, one interaction lights up red.
 *  Animation is driven by CSS classes in home.css (.hs-*), one orchestrated sequence. */
export default function HeroScene() {
  const id = uid(useId());
  const wa = { x: (byId.W.x + byId.A.x) / 2, y: (byId.W.y + byId.A.y) / 2 - 8 };
  return (
    <svg className="hs" viewBox="0 -96 600 636" role="img" aria-label="Network of medications with one high-severity interaction highlighted between warfarin and aspirin">
      <defs>
        <radialGradient id={`${id}glow`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#2bd9b5" stopOpacity=".34" /><stop offset="1" stopColor="#2bd9b5" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}red`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ff6b7a" stopOpacity=".5" /><stop offset="1" stopColor="#ff6b7a" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}node`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".2" /><stop offset="1" stopColor="#ffffff" stopOpacity=".04" /></linearGradient>
        <linearGradient id={`${id}edge`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2bd9b5" stopOpacity=".15" /><stop offset=".5" stopColor="#7df0d8" stopOpacity=".65" /><stop offset="1" stopColor="#2bd9b5" stopOpacity=".15" /></linearGradient>
        <filter id={`${id}blur`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>

      <circle cx="300" cy="270" r="250" fill={`url(#${id}glow)`} />
      <g fill="none" stroke="#fff" strokeOpacity=".07">
        <circle cx="300" cy="270" r="120" />
        <circle cx="300" cy="270" r="190" strokeDasharray="2 7" />
        <circle cx="300" cy="270" r="250" />
      </g>

      {EDGES.map(([a, b], i) => (
        <line key={a + b} className="hs-edge" style={{ '--i': i }} pathLength="1" x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y} stroke={`url(#${id}edge)`} strokeWidth="1.6" />
      ))}

      {/* the interaction */}
      <ellipse className="hs-hot-glow" cx={wa.x} cy={wa.y + 8} rx="120" ry="44" fill={`url(#${id}red)`} filter={`url(#${id}blur)`} />
      <line className="hs-edge hs-edge-hot" pathLength="1" x1={byId.W.x} y1={byId.W.y} x2={byId.A.x} y2={byId.A.y} stroke="#ff6b7a" strokeWidth="3" strokeLinecap="round" />
      <line className="hs-flow" x1={byId.W.x} y1={byId.W.y} x2={byId.A.x} y2={byId.A.y} stroke="#fff" strokeOpacity=".85" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 12" />

      {NODES.map((n, i) => (
        <g key={n.id} className="hs-node" style={{ '--i': i, transformOrigin: `${n.x}px ${n.y}px` }}>
          {n.hot && <circle className="hs-ring" cx={n.x} cy={n.y} r="34" fill="none" stroke="#ff6b7a" strokeWidth="1.5" />}
          <circle cx={n.x} cy={n.y} r="30" fill={`url(#${id}node)`} stroke={n.hot ? '#ff8b97' : '#fff'} strokeOpacity={n.hot ? 0.9 : 0.28} strokeWidth="1.4" />
          <g transform={`translate(${n.x} ${n.y}) rotate(${-35 + i * 28})`}>
            <rect x="-14" y="-6.5" width="28" height="13" rx="6.5" fill={n.hue} opacity=".95" />
            <rect x="0" y="-6.5" width="14" height="13" rx="6.5" fill="#fff" opacity=".92" />
            <rect x="-3" y="-6.5" width="6" height="13" fill={n.hue} opacity=".95" />
            <rect x="-10" y="-4.6" width="18" height="2.6" rx="1.3" fill="#fff" opacity=".45" />
          </g>
          <g transform={`translate(${n.x} ${n.y + 46})`}>
            <rect x={-(n.label.length * 3.7 + 12)} y="-11" width={n.label.length * 7.4 + 24} height="22" rx="11" fill="#04212d" fillOpacity=".72" stroke="#fff" strokeOpacity=".16" />
            <text textAnchor="middle" y="4" fontSize="11.5" fontWeight="600" fill="#d7eef2" style={{ fontFamily: 'var(--font-body)' }}>{n.label}</text>
          </g>
        </g>
      ))}

      <g className="hs-alert" style={{ transformOrigin: `${wa.x}px ${wa.y}px` }}>
        <circle cx={wa.x} cy={wa.y} r="19" fill="#ff6b7a" />
        <circle cx={wa.x} cy={wa.y} r="19" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" />
        <path d={`M${wa.x} ${wa.y - 8}v9`} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx={wa.x} cy={wa.y + 7} r="1.7" fill="#fff" />
      </g>
    </svg>
  );
}
