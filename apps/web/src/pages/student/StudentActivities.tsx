import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, MessageSquare, PlayCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { StudentActivity } from '../../api/portalTypes';
import { PageHeader } from '../../components/Cards';
import { EmptyState, QueryState } from '../../components/Feedback';
import { FormField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { Tabs } from '../../components/Tabs';
import { date, dateTime } from '../../lib/format';
import { ACTIVITY_TYPE_LABEL } from './shared';
import { activityLink } from './StudentHome';

const TABS = [
  { id: 'pending', label: 'To do' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

export default function StudentActivities() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending';
  const q = useGet<StudentActivity[]>('/student/activities', { status });
  const [completing, setCompleting] = useState<StudentActivity | null>(null);
  const [note, setNote] = useState('');
  const complete = useMutate((v: { id: string; note: string }) => api.post(`/student/activities/${v.id}/complete`, v.note.trim() ? { note: v.note.trim() } : {}), {
    invalidate: ['/student'],
    success: 'Marked as complete. Well done!',
    onSuccess: () => {
      setCompleting(null);
      setNote('');
    },
  });

  return (
    <div className="student-page">
      <PageHeader title="My activities" subtitle="Quizzes, practice and worksheets from your teachers." />
      <Tabs tabs={TABS} active={status} onChange={(id) => setParams({ status: id })} label="Activity status">
        <QueryState query={q} loadingLabel="Loading activities…">
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title={status === 'pending' ? 'Nothing to do right now' : 'No activities here yet'}
                message={status === 'pending' ? 'New activities from your teachers will show up here.' : undefined}
              />
            ) : (
              <ul className="activity-list">
                {list.map((a) => (
                  <li key={a._id} className={`activity-card ${a.completed ? 'is-done' : ''}`}>
                    <div className="activity-card__head">
                      <span className={`type-pill type-pill--${a.type}`}>{ACTIVITY_TYPE_LABEL[a.type]}</span>
                      <span className="muted small">{a.subjectId?.name}</span>
                      {a.completed ? (
                        <span className="badge badge--green">
                          <CheckCircle2 size={12} aria-hidden /> Done
                        </span>
                      ) : a.overdue ? (
                        <span className="badge badge--red">Overdue</span>
                      ) : null}
                    </div>
                    <h3>{a.title}</h3>
                    {a.instructions && <p className="muted">{a.instructions}</p>}
                    {a.worksheetRef && (
                      <p className="small">
                        <strong>Worksheet:</strong> {a.worksheetRef}
                      </p>
                    )}
                    <p className="small muted">
                      From {a.teacherId?.name ?? 'your teacher'} · due {dateTime(a.dueAt)}
                      {a.completedAt ? ` · completed ${date(a.completedAt)}` : ''}
                    </p>
                    {a.result && (
                      <p className="small">
                        Score: <strong>{Math.round(a.result.percent)}%</strong> ({a.result.score}/{a.result.maxScore})
                      </p>
                    )}
                    {a.teacherFeedback && (
                      <p className="feedback-note">
                        <MessageSquare size={14} aria-hidden /> <strong>Teacher feedback:</strong> {a.teacherFeedback}
                      </p>
                    )}
                    {!a.completed && (
                      <div className="row">
                        {a.type === 'quiz' ? (
                          a.quizId ? (
                            <Link className="btn btn--mango" to={activityLink(a)}>
                              <PlayCircle size={16} aria-hidden /> Start quiz
                            </Link>
                          ) : (
                            <span className="muted small">The quiz for this activity is not available.</span>
                          )
                        ) : (
                          <button type="button" className="btn btn--mango" onClick={() => setCompleting(a)}>
                            <ClipboardList size={16} aria-hidden /> Mark complete
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </Tabs>

      <Modal
        open={Boolean(completing)}
        title={`Mark “${completing?.title ?? ''}” complete`}
        onClose={() => setCompleting(null)}
        busy={complete.isPending}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setCompleting(null)} disabled={complete.isPending}>
              Cancel
            </button>
            <button type="button" className="btn btn--mango" disabled={complete.isPending} onClick={() => completing && complete.mutate({ id: completing._id, note })}>
              {complete.isPending ? 'Saving…' : 'Mark complete'}
            </button>
          </>
        }
      >
        <FormField label="Note for your teacher (optional)" hint={`${note.length}/500`} error={note.length > 500 ? 'Keep your note under 500 characters' : undefined}>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What did you do? Anything you found hard?" />
        </FormField>
      </Modal>
    </div>
  );
}
