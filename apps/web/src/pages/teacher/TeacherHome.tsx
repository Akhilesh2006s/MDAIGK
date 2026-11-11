import { Link } from 'react-router-dom';
import { CalendarClock, ClipboardCheck, ClipboardList, GraduationCap, Plus, Users } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { TeacherHome as Home } from '../../api/portalTypes';
import { Card, PageHeader, StatCard, StatGrid } from '../../components/Cards';
import { EmptyState, QueryState } from '../../components/Feedback';
import { DASH, dateTime, pct } from '../../lib/format';
import { ProgressBar } from '../school/shared';
import { greeting } from '../student/shared';

export default function TeacherHome() {
  const q = useGet<Home>('/teacher/home');
  return (
    <QueryState query={q} loadingLabel="Loading your dashboard…">
      {(h) => {
        const sectionLabel = (id: string) => h.classes.find((c) => c.sectionId === id)?.label ?? '';
        return (
          <>
            <PageHeader
              title={`${greeting()}, ${h.teacher.name.split(' ')[0]}`}
              subtitle={h.teacher.schoolName}
              actions={
                <Link to="/teacher/activities?new=1" className="btn btn--primary">
                  <Plus size={16} aria-hidden /> New activity
                </Link>
              }
            />
            <StatGrid>
              <StatCard label="My classes" value={h.totals.classes} icon={GraduationCap} />
              <StatCard label="Students" value={h.totals.students} icon={Users} />
              <StatCard label="Active activities" value={h.totals.activeActivities} icon={ClipboardList} hint="Published, not closed" />
              <StatCard label="Pending reviews" value={h.totals.pendingReviews} icon={ClipboardCheck} tone={h.totals.pendingReviews ? 'gold' : 'default'} hint="Practice & worksheet submissions" />
            </StatGrid>
            <div className="grid-2-1">
              <Card title="My classes" subtitle="Average quiz score · all time (all subjects)" actions={<Link to="/teacher/classes">All classes</Link>}>
                {h.classes.length === 0 ? (
                  <EmptyState title="No classes assigned" message="Ask your School Admin to assign you to a class section." />
                ) : (
                  <div className="class-cards">
                    {h.classes.map((c) => (
                      <Link key={c.sectionId} to={`/teacher/classes/${c.sectionId}/students`} className="class-card">
                        <div className="class-card__head">
                          <strong>{c.label}</strong>
                          {c.locked && <span className="badge badge--grey">Locked</span>}
                        </div>
                        <p className="muted small">{c.subjects.map((s) => s.name).join(', ') || 'No subjects'}</p>
                        <div className="class-card__stats">
                          <span>
                            <Users size={14} aria-hidden /> {c.studentCount ?? DASH} students
                          </span>
                          <span>
                            Avg <strong>{c.sampleSize ? pct(c.averagePercent) : DASH}</strong>
                          </span>
                        </div>
                        <ProgressBar value={c.sampleSize ? c.averagePercent : null} label={`${c.label} average`} />
                        <p className="muted small">n = {c.sampleSize ?? 0} quiz attempts</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <div className="stack">
                <Card title="Pending reviews">
                  {h.totals.pendingReviews === 0 ? (
                    <p className="muted">No submissions waiting for feedback.</p>
                  ) : (
                    <p>
                      <strong>{h.totals.pendingReviews}</strong> practice/worksheet submission{h.totals.pendingReviews === 1 ? '' : 's'} waiting for your feedback.{' '}
                      <Link to="/teacher/activities?status=published">Review now</Link>
                    </p>
                  )}
                </Card>
                <Card title="Upcoming due" subtitle="Next published activities">
                  {h.upcoming.length === 0 ? (
                    <EmptyState title="Nothing due soon" />
                  ) : (
                    <ul className="list-plain">
                      {h.upcoming.map((u) => (
                        <li key={u._id}>
                          <CalendarClock size={14} aria-hidden />{' '}
                          <Link to={`/teacher/activities/${u._id}/results`}>{u.title}</Link>
                          <span className="muted small">
                            {' '}
                            · {sectionLabel(u.classSectionId)} · {u.type} · due {dateTime(u.dueAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
