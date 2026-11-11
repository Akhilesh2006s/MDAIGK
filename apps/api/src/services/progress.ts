import type { Types } from 'mongoose';
import { ActivityCompletion, AssessmentAttempt, Certificate, GameAttempt, LearningProgress, ProgrammeEnrolment } from '../models';
import { localDateKey, shiftDateKey } from '../utils/dates';

/**
 * Learning streak rule (documented in docs/BUSINESS_RULES.md):
 * a day (in the school's timezone) counts when the student submitted a quiz,
 * completed a learning item, finished a game, or completed an assigned activity.
 * The streak is the number of consecutive counted days ending today, or ending
 * yesterday if nothing has been recorded yet today.
 */
export async function learningStreak(studentId: Types.ObjectId, timezone: string, lookbackDays = 120) {
  const since = new Date(Date.now() - lookbackDays * 86400000);
  const [attempts, learning, games, completions] = await Promise.all([
    AssessmentAttempt.find({ studentId, submittedAt: { $gte: since } }).select('submittedAt').lean(),
    LearningProgress.find({ studentId, completedAt: { $gte: since } }).select('completedAt').lean(),
    GameAttempt.find({ studentId, finishedAt: { $gte: since } }).select('finishedAt').lean(),
    ActivityCompletion.find({ studentId, completedAt: { $gte: since } }).select('completedAt').lean(),
  ]);
  const days = new Set<string>();
  attempts.forEach((a) => a.submittedAt && days.add(localDateKey(a.submittedAt, timezone)));
  learning.forEach((l) => l.completedAt && days.add(localDateKey(l.completedAt, timezone)));
  games.forEach((g) => g.finishedAt && days.add(localDateKey(g.finishedAt, timezone)));
  completions.forEach((c) => c.completedAt && days.add(localDateKey(c.completedAt, timezone)));

  const today = localDateKey(new Date(), timezone);
  let cursor = days.has(today) ? today : shiftDateKey(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }
  return { current: streak, activeToday: days.has(today), activeDaysInWindow: days.size };
}

export const BADGES = [
  { code: 'FIRST_QUIZ', name: 'Quiz Starter', description: 'Submitted your first quiz.' },
  { code: 'QUIZ_10', name: 'Quiz Champion', description: 'Submitted 10 quizzes.' },
  { code: 'PERFECT_SCORE', name: 'Perfect Score', description: 'Scored 100% on a quiz.' },
  { code: 'LEARNER_5', name: 'Curious Learner', description: 'Completed 5 learning items.' },
  { code: 'STREAK_3', name: '3-Day Streak', description: 'Learned 3 days in a row.' },
  { code: 'STREAK_7', name: 'Week Warrior', description: 'Learned 7 days in a row.' },
  { code: 'GAMER', name: 'Game On', description: 'Finished your first game.' },
  { code: 'EXPLORER', name: 'Programme Explorer', description: 'Started an enrichment programme.' },
  { code: 'CERTIFIED', name: 'Certified', description: 'Earned your first certificate.' },
] as const;

/** Badges are awarded only from stored records — the client never decides. */
export async function earnedBadges(studentId: Types.ObjectId, timezone: string) {
  const [quizCount, perfect, learned, games, enrolments, certs, streak] = await Promise.all([
    AssessmentAttempt.countDocuments({ studentId }),
    AssessmentAttempt.exists({ studentId, percent: 100 }),
    LearningProgress.countDocuments({ studentId, status: 'completed' }),
    GameAttempt.exists({ studentId, outcome: 'completed' }),
    ProgrammeEnrolment.exists({ studentId }),
    Certificate.exists({ studentId }),
    learningStreak(studentId, timezone),
  ]);
  const earned = new Set<string>();
  if (quizCount >= 1) earned.add('FIRST_QUIZ');
  if (quizCount >= 10) earned.add('QUIZ_10');
  if (perfect) earned.add('PERFECT_SCORE');
  if (learned >= 5) earned.add('LEARNER_5');
  if (streak.current >= 3) earned.add('STREAK_3');
  if (streak.current >= 7) earned.add('STREAK_7');
  if (games) earned.add('GAMER');
  if (enrolments) earned.add('EXPLORER');
  if (certs) earned.add('CERTIFIED');
  return BADGES.map((b) => ({ ...b, earned: earned.has(b.code) }));
}
