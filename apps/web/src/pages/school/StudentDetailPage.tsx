import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Award, BookOpenCheck, Target } from 'lucide-react';
import { api } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { StudentDetail, StudentRow } from '../../api/types';
import { useSchoolId } from '../../auth/AuthContext';
import { Card, ChartCard, KeyValue, PageHeader, StatCard, StatGrid } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { QueryState } from '../../components/Feedback';
import { ConfirmDialog, SecretDialog } from '../../components/Modal';
import { Badge, PremiumBadge, StatusBadge } from '../../components/Badge';
import { CHART, axisProps, pctTick, tooltipProps } from '../../components/charts';
import { date, dateTime, num, pct, titleCase } from '../../lib/format';
import { ProgressBar, sectionLabel, useSections } from './shared';
import { EditStudentDialog, usableSections } from './StudentsPage';

export default function StudentDetailPage() {
  const schoolId = useSchoolId();
  const { studentId = '' } = useParams();
  const q = useGet<StudentDetail>(`/schools/${schoolId}/students/${studentId}`);
  const sections = useSections();
  const [editing, setEditing] = useState<'edit' | 'move' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const reset = useMutate(() => api.post<{ pin: string }>(`/schools/${schoolId}/students/${studentId}/reset-pin`), {
    onSuccess: (r) => {
      setConfirmReset(false);
      setPin(r.pin);
    },
  });
  const status = useMutate((next: 'active' | 'inactive') => api.patch(`/schools/${schoolId}/students/${studentId}`, { status: next }), {
    invalidate: [`/schools/${schoolId}`],
    success: 'Student status updated',
    onSuccess: () => setConfirmStatus(false),
  });

  return (
    <QueryState query={q} loadingLabel="Loading student…">
      {(d) => {
        const name = d.user?.name ?? d.profile.displayName ?? d.profile.studentCode;
        const active = d.profile.status === 'active';
        const row: StudentRow = {
          id: studentId,
          profileId: d.profile._id,
          name,
          displayName: d.profile.displayName,
          studentCode: d.profile.studentCode,
          levelNumber: d.profile.levelNumber,
          section: d.profile.classSectionId,
          status: d.profile.status,
          averagePercent: d.performance.averagePercent,
          attempts: d.performance.sampleSize,
        };
        const premium = d.programmes.filter((p) => p.programmeId?.premium);
        const other = d.programmes.filter((p) => !p.programmeId?.premium);
        const programmeRows = [...premium, ...other];
        return (
          <>
            <PageHeader
              breadcrumb={<Link to="/school/students">← Students</Link>}
              title={name}
              subtitle={
                <span className="row">
                  <span className="mono">{d.profile.studentCode}</span> · {sectionLabel(d.profile.classSectionId)} <StatusBadge status={d.profile.status} />
                </span>
              }
              actions={
                <>
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing('edit')}>
                    Edit
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing('move')} disabled={!active}>
                    Move section
                  </button>
                  <button type="button" className="btn btn--secondary" onClick={() => setConfirmReset(true)}>
                    Reset PIN
                  </button>
                  <button type="button" className={`btn ${active ? 'btn--danger' : 'btn--primary'}`} onClick={() => setConfirmStatus(true)}>
                    {active ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              }
            />
            <StatGrid>
              <StatCard label="Average performance" value={pct(d.performance.averagePercent)} hint={`All time · n = ${num(d.performance.sampleSize)} attempts`} icon={Target} tone="positive" />
              <StatCard label="Quiz accuracy" value={pct(d.performance.quizAccuracyPercent)} hint="All time · marks scored / marks available" icon={Target} />
              <StatCard
                label="Activity completion"
                value={pct(d.activityCompletion.ratePercent)}
                hint={`${num(d.activityCompletion.completed)} of ${num(d.activityCompletion.expected)} assigned activities`}
                icon={BookOpenCheck}
              />
              <StatCard label="Certificates" value={num(d.certificates.length)} hint="All time" icon={Award} tone="gold" />
            </StatGrid>
            <div className="grid-2-1">
              <ChartCard
                title="Subject performance"
                period="All time · average score per subject"
                empty={!d.subjects.some((s) => s.averagePercent !== null)}
                emptyMessage="This student has no scored attempts yet."
                footer={`Sample: ${num(d.subjects.reduce((s, x) => s + x.sampleSize, 0))} attempts with a subject`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.subjects.map((s) => ({ name: s.code, full: s.name, avg: s.averagePercent, n: s.sampleSize }))}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                    <Tooltip
                      {...tooltipProps}
                      labelFormatter={(_l, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''}
                      formatter={(v, _n, p) => [`${v ?? '—'}% (n=${(p.payload as { n: number }).n})`, 'Average']}
                    />
                    <Bar dataKey="avg" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <Card title="Profile">
                <KeyValue
                  items={[
                    ['Full name', name],
                    ['Display name', d.profile.displayName || '—'],
                    ['Student ID', <span className="mono">{d.profile.studentCode}</span>],
                    ['Class', sectionLabel(d.profile.classSectionId)],
                    ['Last sign-in', dateTime(d.user?.lastLoginAt)],
                    ['Joined', date(d.user?.createdAt)],
                  ]}
                />
              </Card>
            </div>
            <div style={{ height: 16 }} />
            <div className="grid-2">
              <Card title="Subjects" subtitle="All time">
                <DataTable
                  caption="Subject performance"
                  rows={d.subjects}
                  rowKey={(s) => s.subjectId}
                  emptyTitle="No subjects"
                  columns={[
                    { key: 'name', header: 'Subject', render: (s) => s.name },
                    { key: 'avg', header: 'Average', align: 'right', render: (s) => pct(s.averagePercent) },
                    { key: 'acc', header: 'Accuracy', align: 'right', render: (s) => pct(s.quizAccuracyPercent) },
                    { key: 'n', header: 'Attempts', align: 'right', render: (s) => num(s.sampleSize) },
                  ]}
                />
              </Card>
              <Card title="Certificates">
                <DataTable
                  caption="Certificates"
                  rows={d.certificates}
                  rowKey={(c) => c._id}
                  emptyTitle="No certificates yet"
                  columns={[
                    { key: 'level', header: 'Level', render: (c) => <Badge tone="gold">Level {c.level}</Badge> },
                    { key: 'title', header: 'Title', render: (c) => c.levelTitle },
                    { key: 'pct', header: 'Score', align: 'right', render: (c) => pct(c.percent) },
                    { key: 'num', header: 'Certificate no.', render: (c) => <span className="mono">{c.certificateNumber}</span>, hideSm: true },
                    { key: 'issued', header: 'Issued', render: (c) => date(c.issuedAt) },
                  ]}
                />
              </Card>
              <Card title="Programmes" subtitle="Enrolments and progress">
                <DataTable
                  caption="Programmes"
                  rows={programmeRows}
                  rowKey={(p) => p._id}
                  emptyTitle="Not enrolled in any programme"
                  columns={[
                    { key: 'name', header: 'Programme', render: (p) => <span className="row">{p.programmeId?.name ?? '—'} {p.programmeId?.premium && <PremiumBadge />}</span> },
                    {
                      key: 'progress',
                      header: 'Progress',
                      render: (p) => (
                        <div className="row nowrap">
                          <ProgressBar value={p.progressPct} label="Programme progress" /> {pct(p.progressPct)}
                        </div>
                      ),
                    },
                    { key: 'state', header: 'Status', render: (p) => (p.completedAt ? <Badge tone="green">Completed {date(p.completedAt)}</Badge> : <Badge tone="blue">In progress</Badge>) },
                  ]}
                />
              </Card>
              <Card title="Recent attempts" subtitle="Latest 20 quizzes and assessments">
                <DataTable
                  caption="Recent attempts"
                  rows={d.recentAttempts}
                  rowKey={(a) => a._id}
                  emptyTitle="No attempts yet"
                  columns={[
                    { key: 'quiz', header: 'Quiz', render: (a) => a.quizId?.title ?? '—' },
                    { key: 'ctx', header: 'Type', render: (a) => <Badge tone="outline">{titleCase(a.context ?? '—')}</Badge>, hideSm: true },
                    { key: 'score', header: 'Score', align: 'right', render: (a) => `${a.score}/${a.maxScore} (${pct(a.percent)})` },
                    { key: 'date', header: 'Submitted', render: (a) => dateTime(a.submittedAt) },
                  ]}
                />
              </Card>
            </div>
            {editing && <EditStudentDialog schoolId={schoolId} student={row} mode={editing} sections={usableSections(sections.data)} onClose={() => setEditing(null)} />}
            <ConfirmDialog
              open={confirmReset}
              title={`Reset PIN for ${name}?`}
              message="A new one-time PIN will be generated. The old PIN stops working immediately."
              confirmLabel="Reset PIN"
              busy={reset.isPending}
              onConfirm={() => reset.mutate(undefined)}
              onCancel={() => setConfirmReset(false)}
            />
            <ConfirmDialog
              open={confirmStatus}
              title={active ? `Deactivate ${name}?` : `Activate ${name}?`}
              message={active ? 'The student will no longer be able to sign in. Their records are kept.' : 'The student will be able to sign in again.'}
              confirmLabel={active ? 'Deactivate' : 'Activate'}
              tone={active ? 'danger' : 'primary'}
              busy={status.isPending}
              onConfirm={() => status.mutate(active ? 'inactive' : 'active')}
              onCancel={() => setConfirmStatus(false)}
            />
            <SecretDialog secret={pin} label="PIN" subject={`${name} (${d.profile.studentCode})`} onClose={() => setPin(null)} />
          </>
        );
      }}
    </QueryState>
  );
}
