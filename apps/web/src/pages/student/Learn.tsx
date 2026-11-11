import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Headphones, PlayCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useGet, useInvalidate, useMutate } from '../../api/hooks';
import type { LearningItemDetail, LearningItemRow } from '../../api/portalTypes';
import type { Paginated } from '../../api/types';
import { Card, PageHeader } from '../../components/Cards';
import { EmptyState, QueryState } from '../../components/Feedback';
import { Pagination } from '../../components/DataTable';
import { titleCase } from '../../lib/format';
import { Meter, SectionTitle, SubjectIcon, pctOrDash } from './shared';

interface LearningSubject {
  _id: string;
  code: string;
  name: string;
  icon?: string;
  description?: string;
  totalItems: number;
  completedItems: number;
  progressPercent: number | null;
}

type ContinueRow = LearningItemRow;

function ItemCard({ it }: { it: LearningItemRow }) {
  const status = it.progress?.status;
  return (
    <Link to={`/student/learn/items/${it._id}`} className="item-card">
      <span className="item-card__icon">
        <SubjectIcon icon={it.subjectId?.icon} size={20} />
      </span>
      <span className="item-card__body">
        <strong>{it.title}</strong>
        <span className="muted small">
          {titleCase(it.type)} · {it.subjectId?.name}
          {it.estimatedMinutes ? ` · ${it.estimatedMinutes} min` : ''}
        </span>
        {it.progress && it.progress.status !== 'completed' && <Meter value={it.progress.progressPct} label={`${it.title} progress`} tone="green" />}
      </span>
      {status === 'completed' ? (
        <span className="badge badge--green">
          <CheckCircle2 size={12} aria-hidden /> Done
        </span>
      ) : status ? (
        <span className="badge badge--yellow">{it.progress?.progressPct ?? 0}%</span>
      ) : (
        <span className="badge badge--outline">New</span>
      )}
    </Link>
  );
}

export default function LearnPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'all' ? 'all' : 'mine';
  const subjectId = params.get('subjectId') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;
  const subjects = useGet<LearningSubject[]>('/learning/subjects');
  const cont = useGet<ContinueRow[]>('/learning/continue');
  const items = useGet<Paginated<LearningItemRow>>('/learning/items', { view, subjectId: subjectId || undefined, page, pageSize: 12 });

  function set(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (!('page' in next)) p.delete('page');
    setParams(p);
  }

  return (
    <div className="student-page">
      <PageHeader title="Learn" subtitle="Stories, concepts and activities for your class. Finish a lesson, then try its quick quiz." />

      <QueryState query={cont}>
        {(rows) =>
          rows.length > 0 ? (
            <>
              <SectionTitle>Continue learning</SectionTitle>
              <div className="item-grid">
                {rows.slice(0, 3).map((it) => (
                  <ItemCard key={it._id} it={it} />
                ))}
              </div>
            </>
          ) : null
        }
      </QueryState>

      <SectionTitle>Subjects</SectionTitle>
      <QueryState query={subjects} loadingLabel="Loading subjects…">
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="No subjects yet" />
          ) : (
            <div className="subject-grid" role="group" aria-label="Filter by subject">
              <button type="button" className={`subject-card subject-card--btn ${!subjectId ? 'is-active' : ''}`} aria-pressed={!subjectId} onClick={() => set({ subjectId: '' })}>
                <span className="subject-card__name">All subjects</span>
              </button>
              {list.map((s) => (
                <button key={s._id} type="button" className={`subject-card subject-card--btn ${subjectId === s._id ? 'is-active' : ''}`} aria-pressed={subjectId === s._id} onClick={() => set({ subjectId: s._id })}>
                  <span className="subject-card__icon">
                    <SubjectIcon icon={s.icon} />
                  </span>
                  <span className="subject-card__name">{s.name}</span>
                  <Meter value={s.progressPercent} label={`${s.name} progress`} tone="mango" />
                  <span className="muted small">
                    {s.completedItems}/{s.totalItems} · {pctOrDash(s.progressPercent)}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </QueryState>

      <SectionTitle
        action={
          <div className="seg seg--sm" role="radiogroup" aria-label="Which lessons">
            {(
              [
                ['mine', 'My class'],
                ['all', 'All lessons'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={`seg__btn ${view === v ? 'seg__btn--active' : ''}`} onClick={() => set({ view: v })}>
                {l}
              </button>
            ))}
          </div>
        }
      >
        Lessons
      </SectionTitle>
      <QueryState query={items} loadingLabel="Loading lessons…">
        {(res) =>
          res.items.length === 0 ? (
            <EmptyState title="No lessons found" message={subjectId ? 'Try another subject or switch to “All lessons”.' : 'New lessons will appear here soon.'} />
          ) : (
            <>
              <div className="item-grid">
                {res.items.map((it) => (
                  <ItemCard key={it._id} it={it} />
                ))}
              </div>
              <Pagination page={res.page} totalPages={res.totalPages} total={res.total} pageSize={res.pageSize} onPage={(p) => set({ page: String(p) })} />
            </>
          )
        }
      </QueryState>
    </div>
  );
}

export function LearningItemPage() {
  const { id = '' } = useParams();
  const q = useGet<LearningItemDetail & { quizId?: string }>(`/learning/items/${id}`, undefined, { placeholderData: undefined });
  const invalidate = useInvalidate();
  const opened = useRef<string | null>(null);
  const progress = useMutate((body: { progressPct?: number; completed?: boolean }) => api.post(`/learning/items/${id}/progress`, body), {
    invalidate: ['/learning', '/student'],
  });
  const complete = useMutate(() => api.post(`/learning/items/${id}/progress`, { completed: true }), {
    invalidate: ['/learning', '/student'],
    success: 'Lesson complete. Great work!',
  });

  // Record that the lesson was opened (once per item) so it shows under "Continue learning".
  useEffect(() => {
    const item = q.data;
    if (!item || opened.current === id) return;
    opened.current = id;
    if (!item.progress) progress.mutate({ progressPct: 10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, id]);

  return (
    <div className="student-page student-page--narrow">
      <QueryState query={q} loadingLabel="Opening lesson…">
        {(it) => {
          const done = it.progress?.status === 'completed';
          return (
            <>
              <PageHeader
                title={it.title}
                subtitle={`${titleCase(it.type)} · ${it.subjectId?.name ?? ''}${it.estimatedMinutes ? ` · about ${it.estimatedMinutes} min` : ''}`}
                breadcrumb={
                  <Link to="/student/learn">
                    <ArrowLeft size={14} aria-hidden /> Learn
                  </Link>
                }
              />
              <Card>
                <div className="lesson">
                  {it.imageUrl && <img src={it.imageUrl} alt="" className="lesson__img" />}
                  {it.instructions && (
                    <p className="lesson__instructions">
                      <Clock size={14} aria-hidden /> {it.instructions}
                    </p>
                  )}
                  {it.audioUrl && (
                    <div className="lesson__audio">
                      <p className="small">
                        <Headphones size={14} aria-hidden /> Listen
                      </p>
                      <audio controls src={it.audioUrl} preload="none" onPlay={() => !done && progress.mutate({ progressPct: Math.max(50, it.progress?.progressPct ?? 0) })}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  )}
                  {it.body ? (
                    <div className="lesson__body">
                      {it.body.split(/\n{2,}/).map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  ) : (
                    !it.audioUrl && <p className="muted">{it.description ?? 'This lesson has no text yet.'}</p>
                  )}
                </div>
                <div className="lesson__footer">
                  <div className="lesson__progress">
                    <Meter value={it.progress?.progressPct ?? 0} label="Lesson progress" tone="green" />
                    <span className="muted small">{done ? 'Completed' : `${it.progress?.progressPct ?? 0}% done`}</span>
                  </div>
                  <div className="row">
                    {done ? (
                      <span className="badge badge--green">
                        <CheckCircle2 size={12} aria-hidden /> Completed
                      </span>
                    ) : (
                      <button type="button" className="btn btn--primary" disabled={complete.isPending} onClick={() => complete.mutate(undefined)}>
                        <CheckCircle2 size={16} aria-hidden /> {complete.isPending ? 'Saving…' : 'Mark as complete'}
                      </button>
                    )}
                    {it.quiz && (
                      <Link className="btn btn--mango" to={`/student/quiz/${it.quiz.id}?back=${encodeURIComponent(`/student/learn/items/${id}`)}`} onClick={() => void invalidate('/learning')}>
                        <PlayCircle size={16} aria-hidden /> Take the quiz ({it.quiz.questionCount} questions)
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
