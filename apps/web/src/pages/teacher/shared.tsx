import { useGet } from '../../api/hooks';
import type { TeacherActivity, TeacherClass } from '../../api/portalTypes';

export function useTeacherClasses() {
  return useGet<TeacherClass[]>('/teacher/classes', undefined, { staleTime: 60_000 });
}

export const classLabel = (c: { levelNumber: number; sectionName: string } | null | undefined) => (c ? `Class ${c.levelNumber}-${c.sectionName}` : '—');

export function activitySection(a: TeacherActivity): { _id: string; levelNumber: number; sectionName: string } | null {
  return typeof a.classSectionId === 'object' && a.classSectionId ? a.classSectionId : null;
}

export function activitySubject(a: TeacherActivity): { _id: string; name: string; code: string } | null {
  return typeof a.subjectId === 'object' && a.subjectId ? a.subjectId : null;
}

export const refId = (v: { _id: string } | string | null | undefined): string => (v ? (typeof v === 'string' ? v : v._id) : '');

/** `Date` → value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const STATUS_TONE: Record<string, 'grey' | 'green' | 'red' | 'yellow'> = { draft: 'yellow', published: 'green', closed: 'grey' };
