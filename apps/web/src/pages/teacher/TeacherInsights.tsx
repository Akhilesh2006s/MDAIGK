import { Link, useSearchParams } from 'react-router-dom';
import { Info, Star, LifeBuoy } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { InsightRow, TeacherInsights as Insights } from '../../api/portalTypes';
import { Card, PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { InlineAlert, QueryState } from '../../components/Feedback';
import { DASH, pct } from '../../lib/format';
import { FilterField } from '../school/shared';
import { useTeacherClasses } from './shared';

function InsightTable({ rows, empty }: { rows: InsightRow[]; empty: string }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.studentId}
      emptyTitle={empty}
      columns={[
        { key: 'name', header: 'Student', render: (r) => <Link to={`/teacher/students/${r.studentId}`}>{r.name}</Link> },
        { key: 'class', header: 'Class', render: (r) => r.class },
        { key: 'avg', header: 'Average', align: 'right', render: (r) => (r.attempts ? pct(r.averagePercent) : DASH) },
        { key: 'n', header: 'Quizzes (n)', align: 'right', render: (r) => r.attempts },
      ]}
    />
  );
}

export default function TeacherInsights() {
  const [params, setParams] = useSearchParams();
  const sectionId = params.get('sectionId') ?? '';
  const classes = useTeacherClasses();
  const q = useGet<Insights>('/teacher/insights', { sectionId: sectionId || undefined });
  return (
    <>
      <PageHeader title="Insights" subtitle="Who is doing well and who may need support, based on quiz results." />
      <Card>
        <Toolbar>
          <FilterField label="Class">
            <select value={sectionId} onChange={(e) => setParams(e.target.value ? { sectionId: e.target.value } : {})}>
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
        </Toolbar>
      </Card>
      <QueryState query={q} loadingLabel="Loading insights…">
        {(d) => (
          <>
            <InlineAlert tone="info">
              <Info size={14} aria-hidden /> <strong>{d.window}.</strong> {d.rule}
            </InlineAlert>
            <div className="grid-2">
              <Card
                title={
                  <>
                    <Star size={16} aria-hidden className="text-gold" /> Top performers
                  </>
                }
                subtitle={`${d.window} · highest averages`}
              >
                <InsightTable rows={d.topPerformers} empty="Not enough quiz data yet" />
              </Card>
              <Card
                title={
                  <>
                    <LifeBuoy size={16} aria-hidden /> Needs support
                  </>
                }
                subtitle={d.window}
              >
                <InsightTable rows={d.needsSupport} empty="No students flagged — great!" />
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
