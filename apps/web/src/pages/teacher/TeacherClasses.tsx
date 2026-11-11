import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { ClassStudent } from '../../api/portalTypes';
import { Card, PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { EmptyState, QueryState } from '../../components/Feedback';
import { DASH, dateTime, pct } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useTeacherClasses } from './shared';
import { FilterField } from '../school/shared';

export default function TeacherClasses() {
  const q = useTeacherClasses();
  return (
    <>
      <PageHeader title="My classes" subtitle="Class sections and subjects you are assigned to teach." />
      <QueryState query={q} loadingLabel="Loading classes…">
        {(classes) =>
          classes.length === 0 ? (
            <EmptyState title="No classes assigned" message="Ask your School Admin to assign you to a class section." />
          ) : (
            <div className="class-cards class-cards--wide">
              {classes.map((c) => (
                <Card key={c.sectionId} title={c.label} subtitle={c.academicYear ? `Academic year ${c.academicYear}` : undefined}>
                  <p className="small">
                    <strong>Subjects:</strong> {c.subjects.map((s) => s.name).join(', ') || 'None'}
                  </p>
                  {c.locked ? (
                    <p className="muted small">This class level is not enabled for your school right now.</p>
                  ) : (
                    <div className="row">
                      <Link className="btn btn--secondary btn--sm" to={`/teacher/classes/${c.sectionId}/students`}>
                        <Users size={14} aria-hidden /> Students
                      </Link>
                      <Link className="btn btn--ghost btn--sm" to={`/teacher/activities?sectionId=${c.sectionId}`}>
                        Activities
                      </Link>
                      <Link className="btn btn--ghost btn--sm" to={`/teacher/performance?sectionId=${c.sectionId}`}>
                        Performance
                      </Link>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </QueryState>
    </>
  );
}

export function ClassStudentsPage() {
  const { sectionId = '' } = useParams();
  const classes = useTeacherClasses();
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim(), 250);
  const q = useGet<ClassStudent[]>(`/teacher/classes/${sectionId}/students`, { q: term || undefined });
  const cls = classes.data?.find((c) => c.sectionId === sectionId);

  return (
    <>
      <PageHeader
        title={cls ? `${cls.label} students` : 'Class students'}
        subtitle={cls ? cls.subjects.map((s) => s.name).join(', ') : undefined}
        breadcrumb={
          <Link to="/teacher/classes">
            <ArrowLeft size={14} aria-hidden /> My classes
          </Link>
        }
      />
      <Card>
        <Toolbar>
          <div className="toolbar__grow">
            <FilterField label="Search">
              <input type="search" placeholder="Name or student ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            </FilterField>
          </div>
          {q.data && <span className="muted small">{q.data.length} student{q.data.length === 1 ? '' : 's'} · averages are all-time quiz scores</span>}
        </Toolbar>
        <DataTable
          rows={q.data}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => void q.refetch()}
          fetching={q.isFetching}
          rowKey={(r) => r.id}
          emptyTitle={term ? 'No students match your search' : 'No students in this class yet'}
          caption="Students in this class"
          columns={[
            {
              key: 'name',
              header: 'Student',
              render: (r) => (
                <Link to={`/teacher/students/${r.id}`}>
                  <strong>{r.name}</strong>
                  {r.displayName && r.displayName !== r.name ? <span className="muted small"> ({r.displayName})</span> : null}
                </Link>
              ),
            },
            { key: 'code', header: 'Student ID', render: (r) => r.studentCode },
            { key: 'avg', header: 'Average', align: 'right', render: (r) => (r.attempts ? pct(r.averagePercent) : DASH) },
            { key: 'attempts', header: 'Quizzes', align: 'right', render: (r) => r.attempts, hideSm: true },
            { key: 'cert', header: 'Cert. level', align: 'right', render: (r) => (r.certificationLevel ? `L${r.certificationLevel}` : DASH), hideSm: true },
            { key: 'login', header: 'Last sign-in', render: (r) => dateTime(r.lastLoginAt ?? null), hideSm: true },
          ]}
        />
      </Card>
    </>
  );
}
