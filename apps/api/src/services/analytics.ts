import type { Types } from 'mongoose';
import {
  Activity,
  ActivityCompletion,
  AssessmentAttempt,
  Certificate,
  ClassSection,
  GameAttempt,
  Game,
  Programme,
  ProgrammeEnrolment,
  StudentProfile,
  Subject,
} from '../models';

/**
 * Metric definitions (spec §23). Every summary card, table and chart uses these
 * functions so numbers agree everywhere.
 *  - Average performance: mean of attempt percent for scored attempts in range; sampleSize = attempts counted.
 *  - Quiz accuracy: sum(score) / sum(maxScore) for completed attempts.
 *  - Activity completion: completed (activity, student) pairs / pairs that are published and already available.
 *  - Programme progress: mean progressPct of enrolments.
 *  - Game attempts: accepted game attempt records in range.
 *  - Certificates issued: certificates issued in scope and range.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;

export type AttemptMatch = Record<string, unknown>;

export async function performance(match: AttemptMatch) {
  const [r] = await AssessmentAttempt.aggregate([
    { $match: match },
    { $group: { _id: null, avg: { $avg: '$percent' }, n: { $sum: 1 }, score: { $sum: '$score' }, max: { $sum: '$maxScore' } } },
  ]);
  return {
    averagePercent: r ? round1(r.avg) : null,
    quizAccuracyPercent: r && r.max ? round1((r.score / r.max) * 100) : null,
    sampleSize: r?.n ?? 0,
  };
}

export async function bySubject(match: AttemptMatch) {
  const [rows, subjects] = await Promise.all([
    AssessmentAttempt.aggregate([
      { $match: { ...match, subjectId: { $ne: null } } },
      { $group: { _id: '$subjectId', avg: { $avg: '$percent' }, n: { $sum: 1 }, score: { $sum: '$score' }, max: { $sum: '$maxScore' } } },
    ]),
    Subject.find().sort({ displayOrder: 1 }).lean(),
  ]);
  const map = new Map(rows.map((r) => [r._id.toString(), r]));
  return subjects.map((s) => {
    const r = map.get(s._id.toString());
    return {
      subjectId: s._id,
      code: s.code,
      name: s.name,
      averagePercent: r ? round1(r.avg) : null,
      quizAccuracyPercent: r && r.max ? round1((r.score / r.max) * 100) : null,
      sampleSize: r?.n ?? 0,
    };
  });
}

export async function bySection(match: AttemptMatch, schoolId: Types.ObjectId) {
  const [rows, sections] = await Promise.all([
    AssessmentAttempt.aggregate([
      { $match: { ...match, classSectionId: { $ne: null } } },
      { $group: { _id: '$classSectionId', avg: { $avg: '$percent' }, n: { $sum: 1 } } },
    ]),
    ClassSection.find({ schoolId, status: 'active' }).sort({ levelNumber: 1, sectionName: 1 }).lean(),
  ]);
  const studentCounts = await StudentProfile.aggregate([
    { $match: { schoolId, status: 'active' } },
    { $group: { _id: '$classSectionId', n: { $sum: 1 } } },
  ]);
  const sc = new Map(studentCounts.map((r) => [r._id.toString(), r.n]));
  const map = new Map(rows.map((r) => [r._id.toString(), r]));
  return sections.map((s) => ({
    sectionId: s._id,
    label: `Class ${s.levelNumber}-${s.sectionName}`,
    levelNumber: s.levelNumber,
    sectionName: s.sectionName,
    students: sc.get(s._id.toString()) ?? 0,
    averagePercent: map.get(s._id.toString()) ? round1(map.get(s._id.toString()).avg) : null,
    sampleSize: map.get(s._id.toString())?.n ?? 0,
  }));
}

/** Completed / expected (activity, student) pairs for published activities already open. */
export async function activityCompletion(activityFilter: Record<string, unknown>, studentFilter?: Types.ObjectId) {
  const now = new Date();
  const activities = await Activity.find({ ...activityFilter, status: { $in: ['published', 'closed'] }, startAt: { $lte: now } })
    .select('classSectionId studentIds')
    .lean();
  if (!activities.length) return { expected: 0, completed: 0, ratePercent: null as number | null };
  const sectionIds = [...new Set(activities.filter((a) => !a.studentIds?.length).map((a) => a.classSectionId.toString()))];
  const sectionStudents = await StudentProfile.find({ classSectionId: { $in: sectionIds }, status: 'active' }).select('classSectionId userId').lean();
  const bySectionMap = new Map<string, string[]>();
  sectionStudents.forEach((s) => {
    const k = s.classSectionId.toString();
    bySectionMap.set(k, [...(bySectionMap.get(k) ?? []), s.userId.toString()]);
  });
  let expected = 0;
  const pairs: Array<{ activityId: Types.ObjectId; students: string[] }> = [];
  for (const a of activities) {
    let recipients = a.studentIds?.length ? a.studentIds.map((s) => s.toString()) : bySectionMap.get(a.classSectionId.toString()) ?? [];
    if (studentFilter) recipients = recipients.filter((r) => r === studentFilter.toString());
    expected += recipients.length;
    pairs.push({ activityId: a._id, students: recipients });
  }
  const completed = await ActivityCompletion.countDocuments({
    activityId: { $in: activities.map((a) => a._id) },
    ...(studentFilter ? { studentId: studentFilter } : {}),
  });
  return { expected, completed, ratePercent: expected ? round1((Math.min(completed, expected) / expected) * 100) : null };
}

export async function programmeParticipation(enrolmentMatch: Record<string, unknown>) {
  const [rows, programmes] = await Promise.all([
    ProgrammeEnrolment.aggregate([
      { $match: enrolmentMatch },
      {
        $group: {
          _id: '$programmeId',
          enrolled: { $sum: 1 },
          avgProgress: { $avg: '$progressPct' },
          completed: { $sum: { $cond: [{ $ifNull: ['$completedAt', false] }, 1, 0] } },
        },
      },
    ]),
    Programme.find().sort({ displayOrder: 1 }).lean(),
  ]);
  const map = new Map(rows.map((r) => [r._id.toString(), r]));
  return programmes.map((p) => {
    const r = map.get(p._id.toString());
    return {
      programmeId: p._id,
      code: p.code,
      name: p.name,
      premium: p.premium,
      enrolled: r?.enrolled ?? 0,
      completed: r?.completed ?? 0,
      averageProgressPercent: r ? round1(r.avgProgress) : null,
    };
  });
}

export async function gameStats(match: Record<string, unknown>) {
  const [rows, games] = await Promise.all([
    GameAttempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$gameId',
          attempts: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$outcome', 'completed'] }, 1, 0] } },
          avgScore: { $avg: '$score' },
        },
      },
    ]),
    Game.find().lean(),
  ]);
  const map = new Map(rows.map((r) => [r._id.toString(), r]));
  const perGame = games.map((g) => {
    const r = map.get(g._id.toString());
    return {
      gameId: g._id,
      code: g.code,
      name: g.name,
      attempts: r?.attempts ?? 0,
      completed: r?.completed ?? 0,
      completionPercent: r?.attempts ? round1((r.completed / r.attempts) * 100) : null,
      averageScore: r ? round1(r.avgScore) : null,
    };
  });
  const attempts = perGame.reduce((s, g) => s + g.attempts, 0);
  const completed = perGame.reduce((s, g) => s + g.completed, 0);
  return { attempts, completed, completionPercent: attempts ? round1((completed / attempts) * 100) : null, perGame };
}

export async function certificatesIssued(match: Record<string, unknown>) {
  return Certificate.countDocuments(match);
}

/** Count of documents created per month for the last `months` months. */
export async function monthlyCounts(
  model: { aggregate: typeof StudentProfile.aggregate },
  match: Record<string, unknown>,
  months = 12,
  dateField = 'createdAt',
) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const rows = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: `$${dateField}` } }, n: { $sum: 1 } } },
  ]);
  const before = await (model as unknown as { countDocuments: (q: object) => Promise<number> }).countDocuments({
    ...match,
    [dateField]: { $lt: start },
  });
  const map = new Map(rows.map((r: { _id: string; n: number }) => [r._id, r.n]));
  const out: Array<{ month: string; added: number; cumulative: number }> = [];
  let cumulative = before;
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    const key = d.toISOString().slice(0, 7);
    const added = (map.get(key) as number) ?? 0;
    cumulative += added;
    out.push({ month: key, added, cumulative });
  }
  return out;
}

/** Quiz attempts + finished games per day for the last `days` days. */
export async function dailyActivity(match: Record<string, unknown>, days = 30) {
  const since = new Date(Date.now() - (days - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const [quiz, games] = await Promise.all([
    AssessmentAttempt.aggregate([
      { $match: { ...match, submittedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } }, n: { $sum: 1 } } },
    ]),
    GameAttempt.aggregate([
      { $match: { ...match, startedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, n: { $sum: 1 } } },
    ]),
  ]);
  const q = new Map(quiz.map((r) => [r._id, r.n]));
  const g = new Map(games.map((r) => [r._id, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const key = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
    return { date: key, quizAttempts: q.get(key) ?? 0, gameAttempts: g.get(key) ?? 0 };
  });
}
