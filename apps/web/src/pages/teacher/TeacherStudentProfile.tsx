import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Crown } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { Completion, SubjectScore } from '../../api/portalTypes';
import { Card, KeyValue, PageHeader, StatCard, StatGrid } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { EmptyState, QueryState } from '../../components/Feedback';
import { DASH, date, dateTime, pct, titleCase } from '../../lib/format';
import { ProgressBar } from '../school/shared';

interface Detail {
  profile: { _id: string; userId: { _id: string; name: string; lastLoginAt?: string }; studentCode: string; levelNumber: number; displayName?: string; status: string; classSectionId: string };
  performance: { averagePercent: number | null; quizAccuracyPercent: number | null; sampleSize: number };
  subjects: SubjectScore[];
  recentAttempts: Array<{ _id: string; quizId?: { title: string } | null; subjectId?: { name: string } | null; percent: number; score: number; maxScore: number; submittedAt: string; context: string }>;
  learningHistory: Array<{ _id: string; learningItemId?: { title: string; type: string } | null; subjectId?: { name: string } | null; status: string; progressPct: number; lastOpenedAt?: string }>;
  certificates: Array<{ _id: string; level: number; levelTitle?: string; certificateNumber: string; issuedAt: string; percent?: number }>;
  programmes: Array<{ _id: string; programmeId?: { name: string; code: string; premium: boolean } | null; progressPct: number; completedAt?: string | null }>;
  activityCompletion: Completion | null;
}

export default function TeacherStudentProfile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useGet<Detail>(`/teacher/students/${id}`, undefined, { placeholderData: undefined });
  return (
    <QueryState query={q} loadingLabel="Loading student…">
      {(d) => (
        <>
          <PageHeader
            title={d.profile.userId.name}
            subtitle={`${d.profile.studentCode} · Class ${d.profile.levelNumber}${d.profile.displayName ? ` · goes by “${d.profile.displayName}”` : ''}`}
            breadcrumb={
              <button type="button" className="link-btn" onClick={() => navigate(-1)}>
                <ArrowLeft size={14} aria-hidden /> Back
              </button>
            }
          />
          <StatGrid>
            <StatCard label="Average quiz score" value={d.performance.sampleSize ? pct(d.performance.averagePercent) : DASH} hint={`All time · n = ${d.performance.sampleSize} quizzes`} />
            <StatCard
              label="Activity completion"
              value={d.activityCompletion?.expected ? pct(d.activityCompletion.ratePercent) : DASH}
              hint={d.activityCompletion ? `${d.activityCompletion.completed} of ${d.activityCompletion.expected} activities` : 'No activities assigned'}
            />
            <StatCard label="Certificates" value={d.certificates.length} hint={d.certificates.length ? `Highest: Level ${Math.max(...d.certificates.map((c) => c.level))}` : 'None yet'} tone="gold" />
            <StatCard label="Last sign-in" value={<span className="stat__value--sm">{dateTime(d.profile.userId.lastLoginAt ?? null)}</span>} />
          </StatGrid>
          <div className="grid-2">
            <Card title="Subject scores" subtitle="All time · average quiz score">
              <ul className="subject-bars">
                {d.subjects.map((s) => (
                  <li key={s.subjectId}>
                    <span>{s.name}</span>
                    <ProgressBar value={s.sampleSize ? s.averagePercent : null} label={`${s.name} average`} />
                    <span className="muted small">
                      {s.sampleSize ? pct(s.averagePercent) : DASH} · n = {s.sampleSize}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Certificates & programmes">
              {d.certificates.length === 0 && d.programmes.length === 0 ? (
                <EmptyState title="Nothing yet" message="No certificates earned or programmes started." />
              ) : (
                <KeyValue
                  items={[
                    ...d.certificates.map((c): [string, string] => [`Level ${c.level}${c.levelTitle ? ` · ${c.levelTitle}` : ''}`, `${c.certificateNumber} · ${date(c.issuedAt)}`]),
                    ...d.programmes.map((p): [string, React.ReactNode] => [
                      p.programmeId?.name ?? 'Programme',
                      <span key={p._id}>
                        {p.programmeId?.premium && <Crown size={12} aria-label="Premium" />} {pct(p.progressPct)}
                        {p.completedAt ? ' · completed' : ''}
                      </span>,
                    ]),
                  ]}
                />
              )}
            </Card>
          </div>
          <Card title="Recent quiz attempts" subtitle="Last 20">
            <DataTable
              rows={d.recentAttempts}
              rowKey={(r) => r._id}
              emptyTitle="No quiz attempts yet"
              columns={[
                { key: 'quiz', header: 'Quiz', render: (r) => r.quizId?.title ?? DASH },
                { key: 'subject', header: 'Subject', render: (r) => r.subjectId?.name ?? DASH, hideSm: true },
                { key: 'ctx', header: 'Type', render: (r) => titleCase(r.context), hideSm: true },
                { key: 'score', header: 'Score', align: 'right', render: (r) => `${r.score}/${r.maxScore} (${Math.round(r.percent)}%)` },
                { key: 'date', header: 'Submitted', render: (r) => dateTime(r.submittedAt) },
              ]}
            />
          </Card>
          <Card title="Learning history" subtitle="Last 20 lessons opened">
            <DataTable
              rows={d.learningHistory}
              rowKey={(r) => r._id}
              emptyTitle="No lessons opened yet"
              columns={[
                { key: 'item', header: 'Lesson', render: (r) => r.learningItemId?.title ?? DASH },
                { key: 'type', header: 'Type', render: (r) => (r.learningItemId ? titleCase(r.learningItemId.type) : DASH), hideSm: true },
                { key: 'subject', header: 'Subject', render: (r) => r.subjectId?.name ?? DASH, hideSm: true },
                { key: 'status', header: 'Status', render: (r) => (r.status === 'completed' ? 'Completed' : `${r.progressPct}%`) },
                { key: 'opened', header: 'Last opened', render: (r) => dateTime(r.lastOpenedAt ?? null) },
              ]}
            />
          </Card>
          <p className="muted small">
            <Link to="/teacher/classes">Back to my classes</Link>
          </p>
        </>
      )}
    </QueryState>
  );
}
