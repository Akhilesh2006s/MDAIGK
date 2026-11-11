/** Display helpers. Missing metrics render as an em dash — never a fabricated number. */
export const DASH = '—';

export function num(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? DASH : v.toLocaleString('en-IN');
}

export function pct(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? DASH : `${Math.round(v * 10) / 10}%`;
}

export function date(v: string | Date | null | undefined): string {
  if (!v) return DASH;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(v: string | Date | null | undefined): string {
  if (!v) return DASH;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** yyyy-mm-dd for <input type="date"> */
export function isoDay(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function classLevels(levels: number[] | undefined | null): string {
  if (!levels?.length) return DASH;
  const sorted = [...levels].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  return runs.join(', ');
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
