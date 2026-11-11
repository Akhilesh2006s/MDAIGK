import type { ReactNode } from 'react';
import { Atom, BookOpen, Calculator, Cpu, FlaskConical, Globe2, Trophy, type LucideIcon } from 'lucide-react';
import { DASH } from '../../lib/format';

export const AVATARS: Array<{ key: string; emoji: string; label: string }> = [
  { key: 'mango', emoji: '🥭', label: 'Mango' },
  { key: 'rocket', emoji: '🚀', label: 'Rocket' },
  { key: 'star', emoji: '⭐', label: 'Star' },
  { key: 'owl', emoji: '🦉', label: 'Owl' },
  { key: 'tiger', emoji: '🐯', label: 'Tiger' },
  { key: 'panda', emoji: '🐼', label: 'Panda' },
  { key: 'robot', emoji: '🤖', label: 'Robot' },
  { key: 'books', emoji: '📚', label: 'Books' },
  { key: 'football', emoji: '⚽', label: 'Football' },
  { key: 'planet', emoji: '🪐', label: 'Planet' },
];

export function Avatar({ avatar, name, size = 'md' }: { avatar?: string | null; name: string; size?: 'md' | 'lg' }) {
  const a = AVATARS.find((x) => x.key === avatar);
  return (
    <span className={`student-avatar student-avatar--${size}`} aria-hidden>
      {a ? a.emoji : name.charAt(0).toUpperCase()}
    </span>
  );
}

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  calculator: Calculator,
  flask: FlaskConical,
  cpu: Cpu,
  trophy: Trophy,
  globe: Globe2,
};

export function SubjectIcon({ icon, size = 22 }: { icon?: string; size?: number }) {
  const I = (icon && SUBJECT_ICONS[icon]) || Atom;
  return <I size={size} aria-hidden />;
}

export function Meter({ value, label, tone }: { value: number | null | undefined; label: string; tone?: 'mango' | 'green' | 'gold' }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={`progress ${tone ? `progress--${tone}` : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
      <div className="progress__bar" style={{ width: `${v}%` }} />
    </div>
  );
}

export function pctOrDash(v: number | null | undefined): string {
  return v === null || v === undefined ? DASH : `${Math.round(v)}%`;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}

export const ACTIVITY_TYPE_LABEL: Record<string, string> = { quiz: 'Quiz', practice: 'Practice', worksheet: 'Worksheet' };

export const LOCK_REASONS: Record<string, string> = {
  NOT_ENABLED: 'Not included in your school’s plan',
  EXPIRED: 'Your school’s access has expired',
  CLASS_NOT_ELIGIBLE: 'Not available for your class',
  NOT_ELIGIBLE: 'Not available for your class',
  PREREQUISITE_NOT_MET: 'Pass the previous level first',
  CLASS_LEVEL_NOT_ELIGIBLE: 'Not available for your class',
  NO_ASSESSMENT: 'Assessment not ready yet',
  NOT_STARTED: 'Not started yet for your school',
  DAILY_LIMIT_REACHED: 'Daily attempt limit reached',
};

export const lockText = (code: string | null | undefined) => (code ? (LOCK_REASONS[code] ?? code.replace(/_/g, ' ').toLowerCase()) : 'Locked');

export function timeOfDay(d: string | Date): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
