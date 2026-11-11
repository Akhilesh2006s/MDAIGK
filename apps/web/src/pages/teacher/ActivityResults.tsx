import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageSquare } from 'lucide-react';
import { api } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { ActivityResults as Results } from '../../api/portalTypes';
import { Badge } from '../../components/Badge';
import { Card, PageHeader, StatCard, StatGrid } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { EmptyState, QueryState } from '../../components/Feedback';
import { FormField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { DASH, dateTime, pct } from '../../lib/format';
import { ProgressBar } from '../school/shared';
import { STATUS_TONE, activitySection, activitySubject, classLabel, refId, useTeacherClasses } from './shared';

type Row = Results['students'][number];

export default function ActivityResults() {
  const { id = '' } = useParams();
  const q = useGet<Results>(`/teacher/activities/${id}/results`, undefined, { placeholderData: undefined });
  const classes = useTeacherClasses();
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [feedback, setFeedback] = useState('');
  const review = useMutate((v: { studentId: string; feedback: string }) => api.post(`/teacher/activities/${id}/completions/${v.studentId}/review`, { feedback: v.feedback }), {
    invalidate: [`/teacher/activities/${id}`, '/teacher/home'],
    success: 'Feedback saved',
    onSuccess: () => setReviewing(null),
  });

  return (
    <QueryState query={q} loadingLabel="Loading results…">
      {(r) => {
        const a = r.activity;
        const isQuiz = a.type === 'quiz';
        // results return the raw activity (ids only), so resolve names from the teacher's classes
        const cls = classes.data?.find((c) => c.sectionId === refId(a.classSectionId));
        const sectionName = activitySection(a) ? classLabel(activitySection(a)) : (cls?.label ?? '');
        const subjectName = activitySubject(a)?.name ?? cls?.subjects.find((s) => s._id === refId(a.subjectId))?.name ?? '';
        const maxWrong = Math.max(1, ...r.questionReview.map((x) => x.wrongCount));
        return (
          <>
            <PageHeader
              title={a.title}
              subtitle={
                <>
                  {[sectionName, subjectName, a.type].filter(Boolean).join(' · ')} · due {dateTime(a.dueAt)} <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                </>
              }
              breadcrumb={
                <Link to="/teacher/activities">
                  <ArrowLeft size={14} aria-hidden /> Activities
                </Link>
              }
            />
            <StatGrid>
              <StatCard label="Recipients" value={r.summary.recipients} />
              <StatCard label="Completed" value={`${r.summary.completed} / ${r.summary.recipients}`} hint={r.summary.recipients ? `${pct(r.summary.completionPercent)} completion` : undefined} />
              {isQuiz && <StatCard label="Average score" value={r.summary.completed ? pct(r.summary.averagePercent) : DASH} hint={`n = ${r.students.filter((s) => s.percent !== null).length} submissions`} />}
              {!isQuiz && <StatCard label="Awaiting feedback" value={r.students.filter((s) => s.completed && !s.reviewedAt).length} tone="gold" />}
            </StatGrid>

            <Card title="Students" subtitle={isQuiz ? 'Quiz scores for this activity' : 'Submissions — add feedback to review them'}>
              <DataTable
                rows={r.students}
                rowKey={(s) => s.studentId}
                emptyTitle="No recipients"
                caption="Student results"
                columns={[
                  {
                    key: 'name',
                    header: 'Student',
                    render: (s) => (
                      <Link to={`/teacher/students/${s.studentId}`}>
                        {s.name} <span className="muted small">({s.studentCode})</span>
                      </Link>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (s) =>
                      s.completed ? (
                        <Badge tone={s.late ? 'yellow' : 'green'}>{s.late ? 'Late' : 'Done'}</Badge>
                      ) : (
                        <Badge tone="grey">Not yet</Badge>
                      ),
                  },
                  { key: 'when', header: 'Completed', render: (s) => dateTime(s.completedAt), hideSm: true },
                  ...(isQuiz
                    ? [{ key: 'score', header: 'Score', align: 'right' as const, render: (s: Row) => (s.percent === null ? DASH : `${s.score}/${s.maxScore} (${Math.round(s.percent)}%)`) }]
                    : [
                        { key: 'note', header: 'Student note', render: (s: Row) => s.note || <span className="muted">—</span>, hideSm: true },
                        {
                          key: 'review',
                          header: 'Feedback',
                          render: (s: Row) =>
                            !s.completed ? (
                              <span className="muted">—</span>
                            ) : (
                              <div className="stack--sm">
                                {s.teacherFeedback && <span className="small">{s.teacherFeedback}</span>}
                                <button
                                  type="button"
                                  className={`btn btn--sm ${s.reviewedAt ? 'btn--ghost' : 'btn--primary'}`}
                                  onClick={() => {
                                    setReviewing(s);
                                    setFeedback(s.teacherFeedback ?? '');
                                  }}
                                >
                                  {s.reviewedAt ? (
                                    <>
                                      <CheckCircle2 size={14} aria-hidden /> Edit feedback
                                    </>
                                  ) : (
                                    <>
                                      <MessageSquare size={14} aria-hidden /> Review
                                    </>
                                  )}
                                </button>
                              </div>
                            ),
                        },
                      ]),
                ]}
              />
            </Card>

            {isQuiz && (
              <Card title="Question review" subtitle="How many students answered each question incorrectly">
                {r.questionReview.length === 0 ? (
                  <EmptyState title="No answers yet" message="Question statistics appear after students submit." />
                ) : (
                  <ol className="question-review">
                    {r.questionReview.map((qr, i) => (
                      <li key={qr.questionId}>
                        <p>
                          <strong>
                            {i + 1}. {qr.prompt}
                          </strong>
                        </p>
                        <p className="small">
                          Correct answer: <strong>{qr.options[qr.correctIndex] ?? DASH}</strong>
                        </p>
                        <div className="question-review__bar">
                          <ProgressBar value={(qr.wrongCount / maxWrong) * 100} label={`Question ${i + 1} incorrect answers`} />
                          <span className="small">
                            {qr.wrongCount} of {qr.answered} incorrect{qr.answered ? ` (${Math.round((qr.wrongCount / qr.answered) * 100)}%)` : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            )}

            <Modal
              open={Boolean(reviewing)}
              title={`Feedback for ${reviewing?.name ?? ''}`}
              onClose={() => setReviewing(null)}
              busy={review.isPending}
              footer={
                <>
                  <button type="button" className="btn btn--ghost" onClick={() => setReviewing(null)} disabled={review.isPending}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={review.isPending || feedback.length > 2000}
                    onClick={() => reviewing && review.mutate({ studentId: reviewing.studentId, feedback: feedback.trim() })}
                  >
                    {review.isPending ? 'Saving…' : 'Save feedback'}
                  </button>
                </>
              }
            >
              {reviewing?.note && (
                <p className="feedback-note">
                  <strong>Student’s note:</strong> {reviewing.note}
                </p>
              )}
              <FormField label="Feedback" hint={`${feedback.length}/2000 · the student sees this on their activity`} error={feedback.length > 2000 ? 'Keep feedback under 2000 characters' : undefined}>
                <textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              </FormField>
            </Modal>
          </>
        );
      }}
    </QueryState>
  );
}
