import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Crown, Lock, PlayCircle, Sparkles } from 'lucide-react';
import { ERROR_CODES } from '@mango/shared';
import { ApiError, api } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { ProgrammeDetail, StudentProgramme } from '../../api/portalTypes';
import { Card, PageHeader } from '../../components/Cards';
import { EmptyState, QueryState } from '../../components/Feedback';
import { date, titleCase } from '../../lib/format';
import { Meter, SectionTitle, lockText } from './shared';

function ProgrammeCard({ p }: { p: StudentProgramme }) {
  const inner = (
    <>
      <div className="programme-card__head">
        {p.premium ? (
          <span className="gold-badge">
            <Crown size={12} aria-hidden /> Premium academy
          </span>
        ) : (
          <span className="badge badge--green">
            <Sparkles size={12} aria-hidden /> Programme
          </span>
        )}
        {p.locked && (
          <span className="badge badge--grey">
            <Lock size={12} aria-hidden /> Locked
          </span>
        )}
      </div>
      <h3>{p.name}</h3>
      {p.description && <p className="muted small">{p.description}</p>}
      <p className="muted small">
        {p.moduleCount} module{p.moduleCount === 1 ? '' : 's'}
        {p.validUntil && !p.locked ? ` · available until ${date(p.validUntil)}` : ''}
      </p>
      {p.locked ? (
        <p className="small programme-card__lock">
          <Lock size={14} aria-hidden /> {lockText(p.lockReason)}
        </p>
      ) : p.enrolment ? (
        <>
          <Meter value={p.enrolment.progressPercent} label={`${p.name} progress`} tone={p.premium ? 'gold' : 'green'} />
          <p className="small">{p.enrolment.completed ? 'Completed — well done!' : `${Math.round(p.enrolment.progressPercent)}% complete`}</p>
          <span className="btn btn--mango btn--sm">Continue</span>
        </>
      ) : (
        <span className="btn btn--secondary btn--sm">Explore</span>
      )}
    </>
  );
  // Locked cards are not links, so their module content is never requested.
  return p.locked ? (
    <article className={`programme-card is-locked ${p.premium ? 'programme-card--premium' : ''}`} aria-label={`${p.name} (locked)`}>
      {inner}
    </article>
  ) : (
    <Link to={`/student/programmes/${p.id}`} className={`programme-card ${p.premium ? 'programme-card--premium' : ''}`}>
      {inner}
    </Link>
  );
}

export default function ProgrammesPage() {
  const q = useGet<{ premiumAcademies: StudentProgramme[]; otherProgrammes: StudentProgramme[] }>('/programmes');
  return (
    <div className="student-page">
      <PageHeader title="Programmes" subtitle="Enrichment programmes your school has unlocked for you." />
      <QueryState query={q} loadingLabel="Loading programmes…">
        {(d) => (
          <>
            <SectionTitle>Young Scientist & more</SectionTitle>
            {d.otherProgrammes.length === 0 ? (
              <EmptyState title="No programmes yet" />
            ) : (
              <div className="programme-grid">
                {d.otherProgrammes.map((p) => (
                  <ProgrammeCard key={p.id} p={p} />
                ))}
              </div>
            )}
            <SectionTitle>
              <Crown size={18} aria-hidden className="text-gold" /> Premium academies
            </SectionTitle>
            {d.premiumAcademies.length === 0 ? (
              <EmptyState title="No premium academies" />
            ) : (
              <div className="programme-grid">
                {d.premiumAcademies.map((p) => (
                  <ProgrammeCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

export function ProgrammeDetailPage() {
  const { id = '' } = useParams();
  const q = useGet<ProgrammeDetail>(`/programmes/${id}`, undefined, { placeholderData: undefined, retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2 });
  const enrol = useMutate(() => api.post(`/programmes/${id}/enrolments`), { invalidate: ['/programmes', '/student'], success: 'You’re enrolled. Have fun!' });
  const complete = useMutate((itemId: string) => api.post(`/programmes/${id}/items/${itemId}/complete`), { invalidate: ['/programmes', '/student'], success: 'Item completed.' });

  if (q.isError && q.error instanceof ApiError && (q.error.code === ERROR_CODES.PROGRAMME_LOCKED || q.error.status === 403)) {
    return (
      <div className="student-page student-page--narrow">
        <EmptyState
          title="This programme is locked"
          message={q.error.message}
          action={
            <Link to="/student/programmes" className="btn btn--secondary">
              Back to programmes
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="student-page student-page--narrow">
      <QueryState query={q} loadingLabel="Loading programme…">
        {(p) => {
          const items = p.modules.flatMap((m) => m.items);
          const doneCount = items.filter((i) => i.completed).length;
          return (
            <>
              <PageHeader
                title={p.name}
                subtitle={p.description}
                breadcrumb={
                  <Link to="/student/programmes">
                    <ArrowLeft size={14} aria-hidden /> Programmes
                  </Link>
                }
                actions={
                  p.premium ? (
                    <span className="gold-badge">
                      <Crown size={12} aria-hidden /> Premium academy
                    </span>
                  ) : undefined
                }
              />
              {!p.enrolment ? (
                <Card>
                  <div className="row row--between">
                    <p>
                      {p.modules.length} modules · {items.length} items. Enrol to start tracking your progress.
                    </p>
                    <button type="button" className="btn btn--mango" disabled={enrol.isPending} onClick={() => enrol.mutate(undefined)}>
                      {enrol.isPending ? 'Enrolling…' : 'Enrol now'}
                    </button>
                  </div>
                </Card>
              ) : (
                <Card>
                  <p className="small">
                    {doneCount} of {items.length} items done · {Math.round(p.enrolment.progressPct ?? 0)}% of required items
                    {p.enrolment.completedAt ? ` · completed ${date(p.enrolment.completedAt)}` : ''}
                  </p>
                  <Meter value={p.enrolment.progressPct ?? 0} label="Programme progress" tone={p.premium ? 'gold' : 'green'} />
                </Card>
              )}
              {p.modules.length === 0 && <EmptyState title="No modules yet" />}
              {p.modules.map((m, mi) => (
                <Card key={m._id} title={`Module ${mi + 1}: ${m.title}`} subtitle={m.description}>
                  <ol className="programme-items">
                    {m.items.map((it) => (
                      <li key={it._id} className={it.completed ? 'is-done' : ''}>
                        <div className="programme-items__head">
                          <strong>{it.title}</strong>
                          <span className="muted small">
                            {titleCase(it.type)}
                            {it.required === false ? ' · optional' : ''}
                          </span>
                          {it.completed && (
                            <span className="badge badge--green">
                              <CheckCircle2 size={12} aria-hidden /> Done
                            </span>
                          )}
                        </div>
                        {it.content && <p className="muted small">{it.content}</p>}
                        {p.enrolment && !it.completed && (
                          <div className="row">
                            {it.quizId && (
                              <Link className="btn btn--secondary btn--sm" to={`/student/quiz/${it.quizId}?back=${encodeURIComponent(`/student/programmes/${id}`)}`}>
                                <PlayCircle size={14} aria-hidden /> Take item quiz
                              </Link>
                            )}
                            <button type="button" className="btn btn--mango btn--sm" disabled={complete.isPending} onClick={() => complete.mutate(it._id)}>
                              Mark complete
                            </button>
                          </div>
                        )}
                        {it.quizId && !it.completed && p.enrolment && <p className="muted small">Finish the item quiz first, then mark it complete.</p>}
                      </li>
                    ))}
                  </ol>
                </Card>
              ))}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
