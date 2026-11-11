import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Award, Crown, Flame, Lock, Medal } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { StudentProgress } from '../../api/portalTypes';
import { Card, ChartCard, PageHeader, StatCard, StatGrid } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { EmptyState, QueryState } from '../../components/Feedback';
import { CHART, axisProps, pctTick, tooltipProps } from '../../components/charts';
import { date, titleCase } from '../../lib/format';
import { Meter, SectionTitle, pctOrDash } from './shared';

const RANGES = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
];

export default function ProgressPage() {
  const [params, setParams] = useSearchParams();
  const range = RANGES.some((r) => r.id === params.get('range')) ? params.get('range')! : '30d';
  const q = useGet<StudentProgress>('/student/progress', { range });

  return (
    <div className="student-page">
      <PageHeader
        title="My progress"
        subtitle={q.data ? `Showing: ${q.data.rangeLabel}` : undefined}
        actions={
          <div className="seg" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={range === r.id} className={`seg__btn ${range === r.id ? 'seg__btn--active' : ''}`} onClick={() => setParams({ range: r.id })}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      <QueryState query={q} loadingLabel="Loading your progress…">
        {(p) => {
          const subjects = p.subjects.map((s) => ({ name: s.name, value: s.averagePercent, n: s.sampleSize }));
          const certCount = Array.isArray(p.certification.certificates) ? p.certification.certificates.length : p.certification.certificates;
          return (
            <>
              <StatGrid>
                <StatCard label="Average quiz score" value={pctOrDash(p.overall.averagePercent)} hint={`${p.rangeLabel} · ${p.overall.sampleSize} quiz${p.overall.sampleSize === 1 ? '' : 'zes'}`} />
                <StatCard
                  label="Activities completed"
                  value={p.activityCompletion ? `${p.activityCompletion.completed} / ${p.activityCompletion.expected}` : p.overall.completedActivities}
                  hint={p.activityCompletion?.ratePercent !== undefined ? `${pctOrDash(p.activityCompletion?.ratePercent)} · ${p.rangeLabel}` : p.rangeLabel}
                />
                <StatCard label="Lessons completed" value={p.overall.learningItemsCompleted} hint={p.rangeLabel} />
                <StatCard label="Learning streak" value={`${p.streak.current} day${p.streak.current === 1 ? '' : 's'}`} hint={`${p.streak.activeDaysInWindow} active days recently`} icon={Flame} tone="gold" />
              </StatGrid>

              <div className="grid-2">
                <ChartCard title="Average score by subject" period={`${p.rangeLabel} · n = ${p.overall.sampleSize} quizzes`} empty={subjects.every((s) => s.value === null)} emptyMessage="No quizzes in this period yet.">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjects} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid horizontal={false} stroke={CHART.grid} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                      <YAxis type="category" dataKey="name" width={96} interval={0} {...axisProps} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
                      <Tooltip {...tooltipProps} formatter={(v: number, _n, item) => [`${v}% (n = ${(item.payload as { n: number }).n})`, 'Average']} />
                      <Bar dataKey="value" fill={CHART.secondary} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <Card title="Subjects" subtitle={p.rangeLabel}>
                  <ul className="subject-bars">
                    {p.subjects.map((s) => (
                      <li key={s.subjectId ?? s.name}>
                        <span>{s.name}</span>
                        <Meter value={s.averagePercent} label={`${s.name} average`} tone="mango" />
                        <span className="muted small">
                          {pctOrDash(s.averagePercent)} · n = {s.sampleSize}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <SectionTitle>Quiz history</SectionTitle>
              <Card>
                <DataTable
                  rows={p.history}
                  rowKey={(r) => r._id}
                  emptyTitle="No quizzes in this period"
                  caption={`Quiz history, ${p.rangeLabel}`}
                  columns={[
                    { key: 'quiz', header: 'Quiz', render: (r) => r.quizId?.title ?? '—' },
                    { key: 'subject', header: 'Subject', render: (r) => r.subjectId?.name ?? '—', hideSm: true },
                    { key: 'context', header: 'Type', render: (r) => (r.context ? titleCase(r.context) : '—'), hideSm: true },
                    { key: 'percent', header: 'Score', align: 'right', render: (r) => `${Math.round(r.percent)}%` },
                    { key: 'date', header: 'Date', render: (r) => date(r.submittedAt) },
                  ]}
                />
              </Card>

              <div className="grid-2">
                <Card title="Programmes">
                  {p.programmes.length === 0 ? (
                    <EmptyState title="No programmes" />
                  ) : (
                    <ul className="subject-bars">
                      {p.programmes.map((pr) => (
                        <li key={pr.id}>
                          <span>
                            {pr.premium && <Crown size={12} aria-label="Premium" className="text-gold" />} {pr.name}
                          </span>
                          {pr.locked ? (
                            <span className="muted small">
                              <Lock size={12} aria-hidden /> Locked
                            </span>
                          ) : pr.enrolled ? (
                            <>
                              <Meter value={pr.progressPercent} label={`${pr.name} progress`} tone={pr.premium ? 'gold' : 'green'} />
                              <span className="muted small">{pctOrDash(pr.progressPercent)}</span>
                            </>
                          ) : (
                            <Link to={`/student/programmes/${pr.id}`} className="small">
                              Not started — explore
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Certification">
                  <p className="cert-summary">
                    <Award size={28} aria-hidden className="text-gold" />
                    <span>
                      <strong>{p.certification.currentLevel > 0 ? `Level ${p.certification.currentLevel}` : 'Not certified yet'}</strong>
                      <span className="muted small">
                        {' '}
                        · {certCount} certificate{certCount === 1 ? '' : 's'}
                      </span>
                    </span>
                  </p>
                  <Link to="/student/certificates" className="small">
                    Go to certificates
                  </Link>
                </Card>
              </div>

              <SectionTitle>Badges</SectionTitle>
              <div className="badge-grid">
                {p.badges
                  .filter((b) => b.earned !== false)
                  .map((b) => (
                    <div key={b.code} className="badge-tile is-earned">
                      <Medal size={26} aria-hidden />
                      <strong>{b.name}</strong>
                      <span className="muted small">{b.description}</span>
                    </div>
                  ))}
                {p.lockedBadges.map((b) => (
                  <div key={b.code} className="badge-tile is-locked">
                    <Lock size={22} aria-hidden />
                    <strong>{b.name}</strong>
                    <span className="muted small">{b.description}</span>
                  </div>
                ))}
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
