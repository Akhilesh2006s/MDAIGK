import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api, errorMessage, type Query } from '../../api/client';
import { useGet } from '../../api/hooks';
import type { ClassAccessRow, ProgrammeEntitlement, ReportResponse, ReportType } from '../../api/types';
import { useSchoolId } from '../../auth/AuthContext';
import { Card, PageHeader, Toolbar } from '../../components/Cards';
import { DataTable, type Column } from '../../components/DataTable';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { num, pct } from '../../lib/format';
import { FilterField, periodLabel, useSections, useSubjects } from './shared';

type Filter = 'range' | 'class' | 'subject' | 'programme';
interface ReportDef {
  id: string;
  label: string;
  type: ReportType;
  filters: Filter[];
  description: string;
  /** Restrict / order columns (defaults to all keys of the first row). */
  columns?: string[];
}

const REPORTS: ReportDef[] = [
  { id: 'class', label: 'Class-wise', type: 'class', filters: ['range', 'class', 'subject'], description: 'Average quiz/assessment score per section.' },
  { id: 'subject', label: 'Subject-wise', type: 'subject', filters: ['range', 'class', 'subject'], description: 'Average score and quiz accuracy per subject.' },
  {
    id: 'accuracy',
    label: 'Quiz accuracy',
    type: 'subject',
    filters: ['range', 'class', 'subject'],
    description: 'Quiz accuracy = marks scored ÷ marks available, per subject.',
    columns: ['subject', 'quizAccuracyPercent', 'sampleSize'],
  },
  { id: 'games', label: 'Game completion', type: 'games', filters: ['range', 'class'], description: 'Game attempts, completions and average score per game.' },
  { id: 'certificates', label: 'Certificates', type: 'certificates', filters: ['range'], description: 'Certificates issued to students in this school.' },
  { id: 'programmes', label: 'Programme participation', type: 'programmes', filters: ['programme'], description: 'Enrolments, completions and average progress (all time).' },
  { id: 'students', label: 'Student list', type: 'students', filters: ['range', 'class', 'subject'], description: 'Active students with quiz, game and certificate activity.' },
];

const LABELS: Record<string, string> = {
  class: 'Class',
  students: 'Students',
  averagePercent: 'Average %',
  sampleSize: 'Sample (attempts)',
  subject: 'Subject',
  quizAccuracyPercent: 'Quiz accuracy %',
  game: 'Game',
  attempts: 'Attempts',
  completed: 'Completed',
  completionPercent: 'Completion %',
  averageScore: 'Average score',
  certificateNumber: 'Certificate no.',
  student: 'Student',
  level: 'Level',
  title: 'Title',
  percent: 'Score %',
  issuedAt: 'Issued',
  programme: 'Programme',
  premium: 'Premium',
  enrolled: 'Enrolled',
  averageProgressPercent: 'Avg progress %',
  studentCode: 'Student ID',
  name: 'Name',
  quizAttempts: 'Quiz attempts',
  gameAttempts: 'Game attempts',
  certificates: 'Certificates',
};

function formatCell(key: string, v: string | number | null | undefined) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return /Percent$|^percent$/.test(key) ? pct(v) : num(v);
  return v;
}

export default function ReportsPage() {
  const schoolId = useSchoolId();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const active = REPORTS.find((r) => r.id === params.get('type')) ?? REPORTS[0];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [level, setLevel] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const sections = useSections();
  const subjects = useSubjects();
  const access = useGet<ClassAccessRow[]>(`/schools/${schoolId}/class-access`);
  const programmes = useGet<ProgrammeEntitlement[]>(active.filters.includes('programme') ? `/schools/${schoolId}/programme-entitlements` : null);

  const has = (f: Filter) => active.filters.includes(f);
  const rangeError = has('range') && from && to && from > to ? 'Start date must be before end date' : null;
  const query: Query = {
    from: has('range') ? from || undefined : undefined,
    to: has('range') ? to || undefined : undefined,
    levelNumber: has('class') ? level || undefined : undefined,
    sectionId: has('class') ? sectionId || undefined : undefined,
    subjectId: has('subject') ? subjectId || undefined : undefined,
    programmeId: has('programme') ? programmeId || undefined : undefined,
  };
  const path = `/schools/${schoolId}/reports/${active.type}`;
  const q = useGet<ReportResponse>(path, query, { enabled: !rangeError });

  const rows = q.data?.rows;
  const keys = active.columns ?? (rows?.length ? Object.keys(rows[0]) : []);
  const columns: Column<Record<string, string | number | null>>[] = keys.map((k) => ({
    key: k,
    header: LABELS[k] ?? k,
    align: rows?.length && typeof rows.find((r) => r[k] !== null)?.[k] === 'number' ? 'right' : 'left',
    render: (r) => formatCell(k, r[k]),
  }));
  const period = has('range') ? periodLabel(from, to) : 'All time';
  const levels = (access.data ?? []).filter((a) => a.enabled).map((a) => a.levelNumber);
  const sectionOptions = (sections.data ?? []).filter((s) => !s.locked && (!level || s.levelNumber === Number(level)));

  async function exportCsv() {
    setDownloading(true);
    try {
      const name = await api.download(path, { ...query, format: 'csv' }, `${active.type}-report.csv`);
      toast.success(`Downloaded ${name}`);
    } catch (e) {
      toast.error(`Export failed: ${errorMessage(e)}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Filter, review and export school reports as CSV."
        actions={
          <button type="button" className="btn btn--primary" onClick={exportCsv} disabled={downloading || Boolean(rangeError) || !rows?.length}>
            <Download size={16} aria-hidden /> {downloading ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />
      <Tabs label="Report type" tabs={REPORTS.map((r) => ({ id: r.id, label: r.label }))} active={active.id} onChange={(id) => setParams({ type: id }, { replace: true })}>
        <Card title={active.label} subtitle={`${active.description} · Period: ${period}`}>
          <Toolbar>
            {has('range') && (
              <>
                <FilterField label="From">
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-invalid={Boolean(rangeError)} />
                </FilterField>
                <FilterField label="To">
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-invalid={Boolean(rangeError)} />
                </FilterField>
              </>
            )}
            {has('class') && (
              <>
                <FilterField label="Class">
                  <select value={level} onChange={(e) => (setLevel(e.target.value), setSectionId(''))}>
                    <option value="">All classes</option>
                    {levels.map((n) => (
                      <option key={n} value={n}>
                        Class {n}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Section">
                  <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                    <option value="">All sections</option>
                    {sectionOptions.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </>
            )}
            {has('subject') && (
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
            )}
            {has('programme') && (
              <FilterField label="Programme">
                <select value={programmeId} onChange={(e) => setProgrammeId(e.target.value)}>
                  <option value="">All programmes</option>
                  {programmes.data?.map((p) => (
                    <option key={p.programmeId} value={p.programmeId}>
                      {p.name}
                      {p.premium ? ' (Premium)' : ''}
                    </option>
                  ))}
                </select>
              </FilterField>
            )}
          </Toolbar>
          {rangeError && (
            <p className="field__error" role="alert">
              {rangeError}
            </p>
          )}
          <DataTable
            caption={`${active.label} report`}
            rows={rangeError ? [] : rows}
            loading={q.isLoading}
            error={q.error}
            onRetry={() => q.refetch()}
            fetching={q.isFetching}
            rowKey={(_r, i) => String(i)}
            columns={columns}
            emptyTitle={rangeError ? 'Fix the date range to run this report' : 'No data for this report'}
            emptyMessage={rangeError ? undefined : 'Nothing was recorded for the selected filters and period.'}
          />
          {rows && rows.length > 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              {num(rows.length)} row(s) · {period}. Percentages show “—” where no attempts were recorded.
            </p>
          )}
        </Card>
      </Tabs>
    </>
  );
}
