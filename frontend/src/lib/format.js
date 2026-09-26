export const initials = (name = '') =>
  name.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
}

export function daysAgo(n) {
  const d = new Date();
  d.setHours(10, 30, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export function agoLabel(days) {
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} ago`;
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

export const bmi = (h, w) => (h && w ? Math.round((w / ((h / 100) ** 2)) * 10) / 10 : null);
export const bmiLabel = (v) => (v == null ? '—' : v < 18.5 ? 'Underweight' : v < 25 ? 'Normal' : v < 30 ? 'Overweight' : 'Obese');
export const cx = (...c) => c.filter(Boolean).join(' ');
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
