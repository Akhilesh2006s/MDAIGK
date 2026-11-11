import type { ReactNode } from 'react';
import { Crown, Lock } from 'lucide-react';

export type BadgeTone = 'green' | 'yellow' | 'gold' | 'grey' | 'red' | 'blue' | 'outline';

export function Badge({ tone = 'grey', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'green',
  published: 'green',
  inactive: 'grey',
  archived: 'grey',
  draft: 'yellow',
  review: 'blue',
  expired: 'red',
  suspended: 'red',
  closed: 'grey',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge tone="outline">—</Badge>;
  return <Badge tone={STATUS_TONE[status] ?? 'grey'}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

export function PremiumBadge({ label = 'Premium' }: { label?: string }) {
  return (
    <Badge tone="gold">
      <Crown size={12} aria-hidden /> {label}
    </Badge>
  );
}

export function LockedBadge({ label = 'Locked' }: { label?: string }) {
  return (
    <Badge tone="grey">
      <Lock size={12} aria-hidden /> {label}
    </Badge>
  );
}
