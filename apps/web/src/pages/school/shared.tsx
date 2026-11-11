import type { ReactNode } from 'react';
import { useGet } from '../../api/hooks';
import type { Section, Subject } from '../../api/types';
import { useSchoolId } from '../../auth/AuthContext';

export function useSections(schoolId?: string) {
  const own = useSchoolId();
  return useGet<Section[]>(`/schools/${schoolId ?? own}/sections`);
}

export function useSubjects() {
  return useGet<Subject[]>('/subjects');
}

export const sectionLabel = (s: { levelNumber: number; sectionName: string } | null | undefined) => (s ? `Class ${s.levelNumber}-${s.sectionName}` : '—');

/** Human label for a from/to period (used on every metric). */
export function periodLabel(from?: string, to?: string): string {
  if (!from && !to) return 'All time';
  if (from && to) return `${from} to ${to}`;
  return from ? `From ${from}` : `Up to ${to}`;
}

export function ProgressBar({ value, label }: { value: number | null | undefined; label: string }) {
  const v = value ?? 0;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
      <div className="progress__bar" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
    </div>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
