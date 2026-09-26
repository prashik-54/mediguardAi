import { useId } from 'react';
import {
  TriangleAlert, CircleCheck, FileText, UserCheck, Info, Clock, ShieldCheck, UserPlus, FlaskConical, Pencil, Pill,
} from 'lucide-react';

/** MediGuard shield + cross mark. */
export function BrandMark({ size = 30, tone = 'dark' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const dark = tone === 'dark';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="none">
      <defs>
        <linearGradient id={`${id}s`} x1="6" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={dark ? '#4feccb' : '#12a3a0'} /><stop offset="1" stopColor={dark ? '#0f8f8c' : '#064a55'} />
        </linearGradient>
      </defs>
      <path d="M16 2.6 5.2 6.5v8.4c0 6.5 4.4 11.8 10.8 14 6.4-2.2 10.8-7.5 10.8-14V6.5L16 2.6Z" fill={`url(#${id}s)`} />
      <path d="M16 2.6 5.2 6.5v8.4c0 6.5 4.4 11.8 10.8 14V2.6Z" fill="#fff" opacity=".14" />
      <path d="M16 9.2v10.2M10.9 14.3h10.2" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ dark = true, size = 32 }) {
  return (
    <span className={`brand ${dark ? 'on-dark' : ''}`}>
      <span className="brand-mark"><BrandMark size={size} tone={dark ? 'dark' : 'light'} /></span>
      <span className="brand-text">MediGuard <b>AI</b></span>
    </span>
  );
}

const NAMED = {
  alert: TriangleAlert, check: CircleCheck, file: FileText, 'user-check': UserCheck, info: Info, clock: Clock,
  shield: ShieldCheck, 'user-plus': UserPlus, flask: FlaskConical, pen: Pencil, pill: Pill,
};
export function NamedIcon({ name, size = 16 }) {
  const I = NAMED[name] || Info;
  return <I size={size} />;
}

export const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4Z" /><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 23.5Z" /><path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3Z" /><path fill="#EA4335" d="M12 5.4c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3C6.5 7.4 9 5.4 12 5.4Z" /></svg>
);
export const MicrosoftIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z" /><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" /><path fill="#00A4EF" d="M2 12.5h9.5V22H2z" /><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" /></svg>
);
export const AppleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.700 2.400 2.900 2.300 1.200 0 1.600-.7 3-.7s1.800.7 3 .7c1.300 0 2.100-1.100 2.800-2.300.9-1.300 1.300-2.600 1.300-2.700-.1 0-2.500-1-2.500-3.700ZM14.100 5.700c.6-.8 1.100-1.900.9-3-1 0-2.100.7-2.800 1.500-.6.7-1.100 1.800-1 2.900 1.100.1 2.200-.6 2.900-1.400Z" /></svg>
);
