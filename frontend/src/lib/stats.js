/** Small helpers for building real, backend-derived monthly series (Phase 12: no static chart data). */
export function lastMonths(n = 6, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, m: d.toLocaleString('en-US', { month: 'short' }), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000 });
  }
  return out;
}

/** Counts rows per month (rows carry `created_at` in epoch seconds). */
export function bucketByMonth(rows, months, filter = () => true) {
  const counts = Object.fromEntries(months.map((x) => [x.key, 0]));
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r?.created_at || !filter(r)) return;
    const d = new Date(r.created_at * 1000);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (k in counts) counts[k] += 1;
  });
  return months.map((x) => counts[x.key]);
}
