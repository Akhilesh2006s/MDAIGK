import { Link, useSearchParams } from 'react-router-dom';
import { useGet } from '../../api/hooks';
import type { SearchResults } from '../../api/types';
import { Card, PageHeader } from '../../components/Cards';
import { EmptyState, QueryState } from '../../components/Feedback';
import { Badge, StatusBadge } from '../../components/Badge';
import { titleCase } from '../../lib/format';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const res = useGet<SearchResults>(q ? '/search' : null, { q });
  return (
    <>
      <PageHeader title="Search" subtitle={q ? <>Results for “{q}”</> : 'Use the search box in the top bar.'} />
      {!q ? (
        <EmptyState title="Type to search" message="Search schools (name, code, city), users (name, email), student IDs, or class sections like “4-A”." />
      ) : (
        <QueryState query={res} loadingLabel="Searching…">
          {(d) => {
            const total = d.schools.length + d.users.length + d.students.length + d.sections.length;
            if (!total) return <EmptyState title="No results" message={`Nothing matched “${q}”. Try a school code, email or student ID.`} />;
            return (
              <div className="grid-2">
                <Card title={`Schools (${d.schools.length})`}>
                  {d.schools.length ? (
                    <ul className="list-plain">
                      {d.schools.map((s) => (
                        <li key={s._id}>
                          <span>
                            <Link to={`/super/schools/${s._id}`}>
                              <strong>{s.name}</strong>
                            </Link>{' '}
                            <span className="mono muted">{s.schoolCode}</span> {s.city && <span className="muted">· {s.city}</span>}
                          </span>
                          <StatusBadge status={s.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No schools.</p>
                  )}
                </Card>
                <Card title={`Users (${d.users.length})`}>
                  {d.users.length ? (
                    <ul className="list-plain">
                      {d.users.map((u) => (
                        <li key={u._id}>
                          <span>
                            <strong>{u.name}</strong> <span className="muted">{u.email}</span>
                          </span>
                          <span className="row">
                            <Badge tone="outline">{titleCase(u.role)}</Badge>
                            <StatusBadge status={u.status} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No users.</p>
                  )}
                  {d.users.length > 0 && (
                    <p className="small" style={{ marginTop: 8 }}>
                      <Link to="/super/users">Manage users →</Link>
                    </p>
                  )}
                </Card>
                <Card title={`Student IDs (${d.students.length})`}>
                  {d.students.length ? (
                    <ul className="list-plain">
                      {d.students.map((s) => (
                        <li key={s._id}>
                          <span>
                            <span className="mono">{s.studentCode}</span> <strong>{s.userId?.name ?? '—'}</strong> <span className="muted">· Class {s.levelNumber}</span>
                          </span>
                          {s.schoolId ? <Link to={`/super/schools/${s.schoolId._id}?tab=students`}>{s.schoolId.name}</Link> : '—'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No student IDs.</p>
                  )}
                </Card>
                <Card title={`Class sections (${d.sections.length})`} subtitle="Search like “4-A” to find sections">
                  {d.sections.length ? (
                    <ul className="list-plain">
                      {d.sections.map((s) => (
                        <li key={s._id}>
                          <span>
                            <strong>
                              Class {s.levelNumber}-{s.sectionName}
                            </strong>{' '}
                            <span className="muted">{s.academicYear}</span>
                          </span>
                          {s.schoolId ? <Link to={`/super/schools/${s.schoolId._id}?tab=sections`}>{s.schoolId.name}</Link> : '—'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No sections.</p>
                  )}
                </Card>
              </div>
            );
          }}
        </QueryState>
      )}
    </>
  );
}
