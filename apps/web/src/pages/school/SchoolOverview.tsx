import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Award, BookOpenCheck, CalendarRange, GraduationCap, Layers, Gamepad2, Target, Users } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { SchoolOverview as Overview } from '../../api/types';
import { useAuth, useSchoolId } from '../../auth/AuthContext';
import { Card, ChartCard, PageHeader, StatCard, StatGrid, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { ErrorState, Loading } from '../../components/Feedback';
import { PremiumBadge } from '../../components/Badge';
import { CHART, axisProps, pctTick, tooltipProps } from '../../components/charts';
import { classLevels, date, num, pct } from '../../lib/format';
import { FilterField, ProgressBar, periodLabel, useSections, useSubjects } from './shared';

export default function SchoolOverview() {
  const schoolId = useSchoolId();
  const { adminSchools } = useAuth();
  const schoolName = adminSchools.find((s) => s.schoolId === schoolId)?.schoolName;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [level, setLevel] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const sections = useSections();
  const subjects = useSubjects();
  const rangeError = from && to && from > to ? 'Start date must be before end date' : null;
  const q = useGet<Overview>(
    `/schools/${schoolId}/overview`,
    { from: from || undefined, to: to || undefined, levelNumber: level || undefined, sectionId: sectionId || undefined, subjectId: subjectId || undefined },
    { enabled: !rangeError },
  );
  const period = periodLabel(from, to);
  const activeSections = (sections.data ?? []).filter((s) => s.status === 'active' && !s.locked && (!level || s.levelNumber === Number(level)));
  const d = q.data;
  const enabled = d?.counts.enabledClasses ?? [];
  const scope = [level && `Class ${level}`, sectionId && activeSections.find((s) => s._id === sectionId)?.label, subjectId && subjects.data?.find((s) => s._id === subjectId)?.name]
    .filter(Boolean)
    .join(' · ');
  const filtersActive = Boolean(from || to || level || sectionId || subjectId);

  return (
    <>
      <PageHeader title="School overview" subtitle={schoolName} actions={<span className="period-banner"><CalendarRange size={14} aria-hidden /> {period}{scope ? ` · ${scope}` : ''}</span>} />
      <Card>
        <Toolbar>
          <FilterField label="From">
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-invalid={Boolean(rangeError)} />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-invalid={Boolean(rangeError)} />
          </FilterField>
          <FilterField label="Class">
            <select value={level} onChange={(e) => (setLevel(e.target.value), setSectionId(''))}>
              <option value="">All classes</option>
              {enabled.map((n) => (
                <option key={n} value={n}>
                  Class {n}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Section">
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">All sections</option>
              {activeSections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Subject">
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.data?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FilterField>
          {filtersActive && (
            <button type="button" className="btn btn--ghost" onClick={() => (setFrom(''), setTo(''), setLevel(''), setSectionId(''), setSubjectId(''))}>
              Reset filters
            </button>
          )}
        </Toolbar>
        {rangeError && <p className="field__error" role="alert">{rangeError}</p>}
      </Card>
      <div style={{ height: 16 }} />

      {q.isLoading && <Loading label="Loading school metrics…" />}
      {q.isError && !d && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <div className={`stack ${q.isFetching ? 'table-wrap--fetching' : ''}`}>
          <StatGrid>
            <StatCard label="Students" value={num(d.counts.students)} hint={scope ? `Active · ${scope}` : 'Active students'} icon={GraduationCap} />
            <StatCard label="Teachers" value={num(d.counts.teachers)} hint="Active teachers" icon={Users} />
            <StatCard label="Active classes" value={num(d.counts.activeSections)} hint="Sections this academic year" icon={Layers} />
            <StatCard label="Enabled class levels" value={enabled.length ? `${enabled.length} / 10` : '0 / 10'} hint={enabled.length ? `Classes ${classLevels(enabled)}` : 'No classes granted'} icon={Layers} />
            <StatCard
              label="Average performance"
              value={pct(d.performance.averagePercent)}
              hint={`${period} · n = ${num(d.performance.sampleSize)} attempts`}
              icon={Target}
              tone="positive"
            />
            <StatCard label="Certificates issued" value={num(d.counts.certificatesIssued)} hint={period} icon={Award} tone="gold" />
            <StatCard
              label="Activity completion"
              value={pct(d.activityCompletion.ratePercent)}
              hint={`${num(d.activityCompletion.completed)} of ${num(d.activityCompletion.expected)} assigned · current`}
              icon={BookOpenCheck}
            />
            <StatCard label="Game completion" value={pct(d.games.completionPercent)} hint={`${period} · ${num(d.games.attempts)} attempts`} icon={Gamepad2} />
          </StatGrid>

          <div className="grid-2">
            <ChartCard
              title="Class-wise performance"
              period={`${period} · average quiz score per section`}
              empty={!d.classes.some((c) => c.averagePercent !== null)}
              footer={`Sample: ${num(d.classes.reduce((s, c) => s + c.sampleSize, 0))} attempts`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.classes.map((c) => ({ name: c.label.replace('Class ', ''), avg: c.averagePercent, n: c.sampleSize }))}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                  <Tooltip {...tooltipProps} formatter={(v, _n, p) => [`${v ?? '—'}% (n=${(p.payload as { n: number }).n})`, 'Average']} />
                  <Bar dataKey="avg" name="Average %" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Subject-wise performance"
              period={`${period} · average score and quiz accuracy`}
              empty={!d.subjects.some((s) => s.averagePercent !== null)}
              footer={`Sample: ${num(d.subjects.reduce((s, c) => s + c.sampleSize, 0))} attempts`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.subjects.map((s) => ({ name: s.code, full: s.name, avg: s.averagePercent, acc: s.quizAccuracyPercent }))}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                  <Tooltip {...tooltipProps} labelFormatter={(_l, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''} formatter={(v) => `${v ?? '—'}%`} />
                  <Bar dataKey="avg" name="Average %" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="acc" name="Quiz accuracy %" fill={CHART.secondary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid-2">
            <Card title="Programme participation" subtitle="All time · enrolments in this school">
              <DataTable
                caption="Programme participation"
                rows={[...d.programmes].sort((a, b) => Number(b.premium) - Number(a.premium))}
                rowKey={(p) => p.programmeId}
                emptyTitle="No programmes"
                columns={[
                  { key: 'name', header: 'Programme', render: (p) => <span className="row">{p.name} {p.premium && <PremiumBadge />}</span> },
                  { key: 'enrolled', header: 'Enrolled', align: 'right', render: (p) => num(p.enrolled) },
                  { key: 'completed', header: 'Completed', align: 'right', render: (p) => num(p.completed) },
                  {
                    key: 'avg',
                    header: 'Avg progress',
                    render: (p) => (
                      <div className="row nowrap">
                        <ProgressBar value={p.averageProgressPercent} label={`${p.name} average progress`} /> {pct(p.averageProgressPercent)}
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
            <Card title="Recent certificates" subtitle="Latest 5 issued (all time)" actions={<Link to="/school/reports?type=certificates" className="btn btn--ghost btn--sm">All certificates</Link>}>
              <DataTable
                caption="Recent certificates"
                rows={d.recentCertificates}
                rowKey={(c) => c._id}
                emptyTitle="No certificates yet"
                emptyMessage="Certificates appear here when students pass a certification level."
                columns={[
                  { key: 'student', header: 'Student', render: (c) => c.studentDisplayName },
                  { key: 'level', header: 'Level', render: (c) => `L${c.level} · ${c.levelTitle}` },
                  { key: 'percent', header: 'Score', align: 'right', render: (c) => pct(c.percent) },
                  { key: 'issued', header: 'Issued', render: (c) => date(c.issuedAt), hideSm: true },
                ]}
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
