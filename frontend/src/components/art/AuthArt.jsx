import { useId } from 'react';
import { Capsule, Tablet } from './Capsule';

const uid = (raw) => raw.replace(/[^a-zA-Z0-9]/g, '');

/** Large illustration for the auth side panel: a shield at the centre of an
 *  orbit of medications, with an ECG line running beneath it. */
export default function AuthArt() {
  const id = uid(useId());
  return (
    <div className="auth-art" aria-hidden="true">
      <svg viewBox="0 0 520 420" className="auth-art-svg">
        <defs>
          <radialGradient id={`${id}g`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#2bd9b5" stopOpacity=".38" /><stop offset="1" stopColor="#2bd9b5" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${id}sh`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3ee5c3" /><stop offset="1" stopColor="#0a6a78" /></linearGradient>
          <linearGradient id={`${id}sh2`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <linearGradient id={`${id}ecg`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2bd9b5" stopOpacity="0" /><stop offset=".5" stopColor="#7df0d8" /><stop offset="1" stopColor="#2bd9b5" stopOpacity="0" /></linearGradient>
          <filter id={`${id}b`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" /></filter>
        </defs>
        <circle cx="260" cy="200" r="190" fill={`url(#${id}g)`} />
        <g fill="none" stroke="#fff" strokeOpacity=".12">
          <circle cx="260" cy="200" r="96" />
          <circle cx="260" cy="200" r="150" strokeDasharray="3 8" />
          <circle cx="260" cy="200" r="196" />
        </g>
        {/* shield */}
        <g className="auth-shield">
          <ellipse cx="260" cy="316" rx="70" ry="10" fill="#020e14" opacity=".45" filter={`url(#${id}b)`} />
          <path d="M260 104 176 136v66c0 50 34 92 84 108 50-16 84-58 84-108v-66Z" fill={`url(#${id}sh)`} />
          <path d="M260 104 176 136v66c0 50 34 92 84 108 50-16 84-58 84-108v-66Z" fill={`url(#${id}sh2)`} />
          <path d="M260 104 176 136v66c0 50 34 92 84 108 50-16 84-58 84-108v-66Z" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" />
          <path d="M260 156v90M215 201h90" stroke="#fff" strokeWidth="18" strokeLinecap="round" />
          <path d="M260 156v90M215 201h90" stroke="#0a6a78" strokeOpacity=".18" strokeWidth="18" strokeLinecap="round" transform="translate(0 3)" />
        </g>
        {/* ECG */}
        <path className="auth-ecg" d="M20 372h120l14-30 22 60 22-90 22 80 14-20h280" fill="none" stroke={`url(#${id}ecg)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Capsule className="auth-cap c1" w={118} h={42} a="#2bd9b5" b="#ffffff" rot={-18} />
      <Capsule className="auth-cap c2" w={96} h={34} a="#ff6b7a" b="#ffe7ea" rot={24} />
      <Capsule className="auth-cap c3" w={84} h={30} a="#5aa9ff" b="#ffffff" rot={-8} />
      <Tablet className="auth-cap t1" size={44} />
      <Tablet className="auth-cap t2" size={30} color="#ffe2a6" shade="#f0b544" />
    </div>
  );
}
