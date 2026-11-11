export function fmtDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtPercent(value?: number | null): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 10) / 10}%`;
}

/** "in 5h 20m" style countdown to an ISO time. */
export function timeUntil(iso?: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const AVATARS: Record<string, string> = {
  mango: '🥭',
  lion: '🦁',
  owl: '🦉',
  rocket: '🚀',
  star: '⭐',
  tiger: '🐯',
  panda: '🐼',
  robot: '🤖',
  dolphin: '🐬',
  book: '📚',
};
export const avatarEmoji = (a?: string | null) => (a && AVATARS[a]) || AVATARS.mango;

export const LOCK_REASONS: Record<string, string> = {
  NOT_ENABLED: 'This programme is not enabled for your school yet. Ask your school to enable it.',
  EXPIRED: 'Your school’s access to this programme has expired.',
  NOT_STARTED: 'Your school’s access to this programme has not started yet.',
  CLASS_NOT_ELIGIBLE: 'This is not available for your class.',
  PREREQUISITE_NOT_MET: 'Earn the previous level’s certificate first.',
  NO_ASSESSMENT: 'The assessment for this level is not ready yet.',
};
export const lockReasonText = (r?: string | null) => (r ? LOCK_REASONS[r] ?? 'Locked' : 'Locked');
