import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGet } from '../../api/hooks';
import type { TeacherPerformance as Perf } from '../../api/portalTypes';
import { Card, ChartCard, PageHeader, StatCard, StatGrid, Toolbar } from '../../components/Cards';
import { InlineAlert, QueryState } from '../../components/Feedback';
import { CHART, axisProps, pctTick, tooltipProps } from '../../components/charts';
import { DASH, pct } from '../../lib/format';
import { FilterField, periodLabel } from '../school/shared';
import { useTeacherClasses } from './shared';

export default function TeacherPerformance() {
  const [params, setParams] = useSearchParams();
  const sectionId = params.get('sectionId') ?? '';
  const subjectId = params.get('subjectId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const rangeError = from && to && from > to ? 'The start date must be before the end date' : null;
  const classes = useTeacherClasses();
  const q = useGet<Perf>('/teacher/performance', { sectionId: sectionId || undefined, subjectId: subjectId || undefined, from: from || undefined, to: to || undefined }, { enabled: !rangeError });

  const subjectOptions = (() => {
    const list = (classes.data ?? []).filter((c) => !sectionId || c.sectionId === sectionId).flatMap((c) => c.subjects);
    return [...new Map(list.map((s) => [s._id, s])).values()];
  })();

  function set(k: string, v: string) {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === 'sectionId' && subjectId && v) {
      const cls = classes.data?.find((c) => c.sectionId === v);
      if (cls && !cls.subjects.some((s) => s._id === subjectId)) p.delete('subjectId');
    }
    setParams(p);
  }

  const period = periodLabel(from || undefined, to || undefined);
  const scope = `${sectionId ? (classes.data?.find((c) => c.sectionId === sectionId)?.label ?? 'Class') : 'All my classes'}${subjectId ? ` · ${subjectOptions.find((s) => s._id === subjectId)?.name ?? ''}` : ' · all subjects'}`;

  return (
    <>
      <PageHeader title="Performance" subtitle={`${scope} · ${period}`} />
      <Card>
        <Toolbar>
          <FilterField label="Class">
            <select value={sectionId} onChange={(e) => set('sectionId', e.target.value)}>
              <option value="">All my classes</option>
              {classes.data
                ?.filter((c) => !c.locked)
                .map((c) => (
                  <option key={c.sectionId} value={c.sectionId}>
                    {c.label}
                  </option>
                ))}
            </select>
          </FilterField>
          <FilterField label="Subject">
            <select value={subjectId} onChange={(e) => set('subjectId', e.target.value)}>
              <option value="">All my subjects</option>
              {subjectOptions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="From">
            <input type="date" value={from} max={to || undefined} onChange={(e) => set('from', e.target.value)} aria-invalid={Boolean(rangeError)} />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={to} min={from || undefined} onChange={(e) => set('to', e.target.value)} aria-invalid={Boolean(rangeError)} />
          </FilterField>
        </Toolbar>
        {rangeError && <InlineAlert>{rangeError}</InlineAlert>}
      </Card>
      {!rangeError && (
        <QueryState query={q} loadingLabel="Loading performance…">
          {(p) => (
            <>
              <StatGrid>
                <StatCard label="Average quiz score" value={p.summary.sampleSize ? pct(p.summary.averagePercent) : DASH} hint={`${period} · n = ${p.summary.sampleSize} attempts`} />
                <StatCard label="Quiz accuracy" value={p.summary.sampleSize ? pct(p.summary.quizAccuracyPercent) : DASH} hint={`${period} · n = ${p.summary.sampleSize}`} />
                <StatCard
                  label="Activity completion"
                  value={p.activityCompletion?.expected ? pct(p.activityCompletion.ratePercent) : DASH}
                  hint={p.activityCompletion ? `${p.activityCompletion.completed} of ${p.activityCompletion.expected} expected · all published activities` : 'No activities'}
                />
              </StatGrid>
              <div className="grid-2">
                <ChartCard title="Average score by subject (subjects you teach)" period={`${scope} · ${period}`} empty={p.subjects.every((s) => !s.sampleSize)} emptyMessage="No quiz attempts in this period.">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={p.subjects.map((s) => ({ name: s.name, value: s.sampleSize ? s.averagePercent : null, n: s.sampleSize }))} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                      <CartesianGrid vertical={false} stroke={CHART.grid} />
                      <XAxis dataKey="name" {...axisProps} interval={0} tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
                      <YAxis domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                      <Tooltip {...tooltipProps} formatter={(v: number, _n, item) => [`${v}% (n = ${(item.payload as { n: number }).n})`, 'Average']} />
                      <Bar dataKey="value" fill={CHART.primary} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Weekly trend" period={`${scope} · ${period} · ISO weeks`} empty={p.trend.length === 0} emptyMessage="No quiz attempts in this period.">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={p.trend} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
                      <CartesianGrid vertical={false} stroke={CHART.grid} />
                      <XAxis dataKey="week" {...axisProps} tickFormatter={(w: string) => w.replace(/^\d{4}-/, '')} />
                      <YAxis domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                      <Tooltip {...tooltipProps} formatter={(v: number, _n, item) => [`${v}% (n = ${(item.payload as { attempts: number }).attempts})`, 'Average']} />
                      <Line type="monotone" dataKey="averagePercent" stroke={CHART.primary} strokeWidth={2} dot={{ r: 3, fill: CHART.secondary }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
              <Card title="Subjects" subtitle={`${scope} · ${period}`}>
                <table className="table">
                  <caption className="sr-only">Average by subject</caption>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th className="num">Average</th>
                      <th className="num">Attempts (n)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.subjects.map((s) => (
                      <tr key={s.subjectId}>
                        <td>{s.name}</td>
                        <td className="num">{s.sampleSize ? pct(s.averagePercent) : DASH}</td>
                        <td className="num">{s.sampleSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </QueryState>
      )}
    </>
  );
}
