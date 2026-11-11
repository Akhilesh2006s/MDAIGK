import { Link } from 'react-router-dom';
import { Award, BookOpen, ClipboardList, Flame, Gamepad2, Newspaper, PlayCircle, Sparkles, Target } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { StudentActivity, StudentHome as Home } from '../../api/portalTypes';
import { EmptyState, QueryState } from '../../components/Feedback';
import { date } from '../../lib/format';
import { ACTIVITY_TYPE_LABEL, Avatar, Meter, SectionTitle, SubjectIcon, greeting, pctOrDash } from './shared';

const QUICK = [
  { to: '/student/learn', label: 'Learn', icon: BookOpen },
  { to: '/student/news', label: 'News & GK', icon: Newspaper },
  { to: '/student/games', label: 'Games', icon: Gamepad2 },
  { to: '/student/programmes', label: 'Programmes', icon: Sparkles },
  { to: '/student/certificates', label: 'Certificates', icon: Award },
  { to: '/student/activities', label: 'Activities', icon: ClipboardList },
];

export function activityLink(a: Pick<StudentActivity, '_id' | 'type' | 'quizId'>): string {
  if (a.type === 'quiz' && a.quizId) return `/student/quiz/${a.quizId._id}?activityId=${a._id}`;
  return '/student/activities';
}

export default function StudentHome() {
  const home = useGet<Home>('/student/home');
  const pending = useGet<StudentActivity[]>('/student/activities', { status: 'pending' });

  return (
    <QueryState query={home} loadingLabel="Getting your day ready…">
      {(h) => {
        const done = h.dailyProgress.quizzes + h.dailyProgress.learningItems + h.dailyProgress.games;
        const goal = h.dailyProgress.dailyGoal || 3;
        const certCount = Array.isArray(h.certification.certificates) ? h.certification.certificates.length : h.certification.certificates;
        return (
          <div className="student-page">
            <section className="student-hero">
              <Avatar avatar={h.student.avatar} name={h.student.displayName || h.student.name} size="lg" />
              <div className="student-hero__text">
                <p className="student-hero__hello">{greeting()},</p>
                <h1>{h.student.displayName || h.student.name}</h1>
                <p className="muted">
                  {h.student.className} · {h.student.schoolName} · ID {h.student.studentCode}
                </p>
              </div>
              {h.certification.currentLevel > 0 ? (
                <span className="cert-chip" title={`${certCount} certificate${certCount === 1 ? '' : 's'}`}>
                  <Award size={16} aria-hidden /> Level {h.certification.currentLevel} certified
                </span>
              ) : (
                <Link to="/student/certificates" className="cert-chip cert-chip--muted">
                  <Award size={16} aria-hidden /> Not certified yet
                </Link>
              )}
            </section>

            <div className="student-stats">
              <div className="student-stat">
                <Target size={22} aria-hidden />
                <div>
                  <p className="student-stat__label">Today’s goal ({date(h.dailyProgress.date)})</p>
                  <p className="student-stat__value">
                    {Math.min(done, goal)} / {goal}
                  </p>
                  <Meter value={(Math.min(done, goal) / goal) * 100} label="Daily goal progress" tone="mango" />
                  <p className="muted small">
                    {plural(h.dailyProgress.learningItems, 'lesson')} · {plural(h.dailyProgress.quizzes, 'quiz', 'quizzes')} · {plural(h.dailyProgress.games, 'game')}
                  </p>
                </div>
              </div>
              <div className="student-stat">
                <Flame size={22} aria-hidden className="text-mango" />
                <div>
                  <p className="student-stat__label">Learning streak</p>
                  <p className="student-stat__value">
                    {h.streak.current} day{h.streak.current === 1 ? '' : 's'}
                  </p>
                  <p className="muted small">{h.streak.activeToday ? 'You learned today — keep it going!' : 'Learn something today to keep your streak.'}</p>
                </div>
              </div>
              <div className="student-stat">
                <ClipboardList size={22} aria-hidden />
                <div>
                  <p className="student-stat__label">Pending activities</p>
                  <p className="student-stat__value">{h.pendingActivities}</p>
                  <Link to="/student/activities" className="small">
                    See my activities
                  </Link>
                </div>
              </div>
            </div>

            {h.continueLearning && (
              <Link to={`/student/learn/items/${h.continueLearning.id}`} className="continue-card">
                <PlayCircle size={32} aria-hidden />
                <div>
                  <p className="student-stat__label">Continue learning</p>
                  <p className="continue-card__title">{h.continueLearning.title}</p>
                  <Meter value={h.continueLearning.progressPct} label={`${h.continueLearning.title} progress`} tone="green" />
                </div>
                <span className="muted small">{h.continueLearning.progressPct}%</span>
              </Link>
            )}

            <SectionTitle action={<Link to="/student/learn">All subjects</Link>}>My subjects</SectionTitle>
            {h.subjects.length === 0 ? (
              <EmptyState title="No subjects yet" message="Your subjects will appear here once your school sets up your class." />
            ) : (
              <div className="subject-grid">
                {h.subjects.map((s) => (
                  <Link key={s.id} to={`/student/learn?subjectId=${s.id}`} className="subject-card">
                    <span className="subject-card__icon">
                      <SubjectIcon icon={s.icon} />
                    </span>
                    <span className="subject-card__name">{s.name}</span>
                    <Meter value={s.progressPercent} label={`${s.name} progress`} tone="mango" />
                    <span className="muted small">
                      {s.completedItems} of {s.totalItems} lessons · {pctOrDash(s.progressPercent)}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <SectionTitle>Quick links</SectionTitle>
            <nav className="quick-links" aria-label="Quick links">
              {QUICK.map((q) => (
                <Link key={q.to} to={q.to} className="quick-link">
                  <q.icon size={22} aria-hidden />
                  <span>{q.label}</span>
                </Link>
              ))}
            </nav>

            <SectionTitle action={<Link to="/student/activities">View all</Link>}>Pending activities</SectionTitle>
            <QueryState query={pending}>
              {(list) =>
                list.length === 0 ? (
                  <EmptyState title="All caught up!" message="You have no pending activities from your teachers." />
                ) : (
                  <ul className="activity-mini">
                    {list.slice(0, 4).map((a) => (
                      <li key={a._id}>
                        <Link to={activityLink(a)}>
                          <strong>{a.title}</strong>
                          <span className="muted small">
                            {ACTIVITY_TYPE_LABEL[a.type]} · {a.subjectId?.name} · due {date(a.dueAt)}
                          </span>
                        </Link>
                        {a.overdue && <span className="badge badge--red">Overdue</span>}
                      </li>
                    ))}
                  </ul>
                )
              }
            </QueryState>
          </div>
        );
      }}
    </QueryState>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
