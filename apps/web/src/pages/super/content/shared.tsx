import { CONTENT_STATUS } from '@mango/shared';
import { useGet } from '../../../api/hooks';
import type { Paginated, Quiz, Subject } from '../../../api/types';

/** Moderation transitions allowed by the API (content.ts TRANSITIONS). */
export const TRANSITIONS: Record<string, Array<{ to: string; label: string }>> = {
  draft: [
    { to: 'review', label: 'Send to review' },
    { to: 'published', label: 'Publish' },
    { to: 'archived', label: 'Archive' },
  ],
  review: [
    { to: 'published', label: 'Publish' },
    { to: 'draft', label: 'Back to draft' },
    { to: 'archived', label: 'Archive' },
  ],
  published: [
    { to: 'draft', label: 'Unpublish' },
    { to: 'archived', label: 'Archive' },
  ],
  archived: [{ to: 'draft', label: 'Restore to draft' }],
};

export function useSubjectsList() {
  return useGet<Subject[]>('/subjects');
}

export function useQuizOptions(context?: string) {
  return useGet<Paginated<Quiz>>('/quizzes', { context, pageSize: 100 });
}

export function StatusSelect({ id, value, onChange, label = 'Status' }: { id: string; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All statuses</option>
        {CONTENT_STATUS.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Strip empty strings so optional zod fields (url/email) are omitted instead of failing validation. */
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== '' && v !== undefined) out[k] = v;
  return out as Partial<T>;
}
