import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@mango/shared';
import { authenticate, requireRole, resolveMemberSchool } from '../middleware/auth';
import {
  Activity,
  ActivityCompletion,
  AssessmentAttempt,
  Certificate,
  ClassSection,
  GameAttempt,
  LearningItem,
  LearningProgress,
  Programme,
  ProgrammeEnrolment,
  StudentProfile,
  Subject,
} from '../models';
import { programmeAccessMap } from '../services/access';
import * as A from '../services/analytics';
import { earnedBadges, learningStreak } from '../services/progress';
import { localDateKey } from '../utils/dates';
import { badRequest, notFound } from '../utils/errors';
import { ah, oid, param, parse } from '../utils/http';
import { studentCtx } from './helpers';

export const studentRouter = Router();
studentRouter.use(authenticate, requireRole(ROLES.STUDENT), resolveMemberSchool);

function activityFilterFor(profile: { classSectionId: unknown; userId: unknown }, schoolId: unknown) {
  return {
    schoolId,
    classSectionId: profile.classSectionId,
    status: { $in: ['published', 'closed'] },
    startAt: { $lte: new Date() },
    $or: [{ studentIds: { $size: 0 } }, { studentIds: profile.userId }],
  };
}

studentRouter.get(
  '/home',
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const studentId = req.auth!.userId;
    const tz = req.school!.timezone;
    const section = await ClassSection.findById(profile.classSectionId).lean();
    const today = localDateKey(new Date(), tz);
    const dayStart = new Date(Date.now() - 36 * 3600000); // superset, filtered by local key below
    const [subjects, totals, done, attemptsToday, learnedToday, gamesToday, certs, streak, activities, completions, cont] = await Promise.all([
      Subject.find({ enabled: true, classLevels: profile.levelNumber }).sort({ displayOrder: 1 }).lean(),
      LearningItem.aggregate([{ $match: { status: 'published', classLevels: profile.levelNumber } }, { $group: { _id: '$subjectId', n: { $sum: 1 } } }]),
      LearningProgress.aggregate([{ $match: { studentId, status: 'completed' } }, { $group: { _id: '$subjectId', n: { $sum: 1 } } }]),
      AssessmentAttempt.find({ studentId, submittedAt: { $gte: dayStart } }).select('submittedAt').lean(),
      LearningProgress.find({ studentId, completedAt: { $gte: dayStart } }).select('completedAt').lean(),
      GameAttempt.find({ studentId, startedAt: { $gte: dayStart } }).select('startedAt').lean(),
      Certificate.find({ studentId }).sort({ level: -1 }).lean(),
      learningStreak(studentId, tz),
      Activity.find(activityFilterFor(profile, req.school!.schoolId)).select('_id dueAt').lean(),
      ActivityCompletion.find({ studentId }).select('activityId').lean(),
      LearningProgress.findOne({ studentId, status: 'in_progress' }).sort({ lastOpenedAt: -1 }).populate('learningItemId', 'title type status').lean(),
    ]);
    const t = new Map(totals.map((x) => [x._id.toString(), x.n]));
    const d = new Map(done.map((x) => [x._id.toString(), x.n]));
    const isToday = (dt?: Date | null) => Boolean(dt) && localDateKey(dt!, tz) === today;
    const doneIds = new Set(completions.map((c) => c.activityId.toString()));
    const contItem = cont?.learningItemId as unknown as { _id: string; title: string; type: string; status: string } | undefined;
    res.json({
      student: {
        name: req.auth!.name,
        displayName: profile.displayName,
        avatar: profile.avatar,
        studentCode: profile.studentCode,
        className: section ? `Class ${section.levelNumber}-${section.sectionName}` : `Class ${profile.levelNumber}`,
        schoolName: req.school!.schoolName,
      },
      dailyProgress: {
        date: today,
        quizzes: attemptsToday.filter((a) => isToday(a.submittedAt)).length,
        learningItems: learnedToday.filter((l) => isToday(l.completedAt)).length,
        games: gamesToday.filter((g) => isToday(g.startedAt)).length,
        dailyGoal: 3,
      },
      streak,
      certification: { currentLevel: certs[0]?.level ?? 0, certificates: certs.length },
      pendingActivities: activities.filter((a) => !doneIds.has(a._id.toString()) && a.dueAt >= new Date()).length,
      subjects: subjects.map((s) => {
        const total = t.get(s._id.toString()) ?? 0;
        const completed = Math.min(d.get(s._id.toString()) ?? 0, total);
        return { id: s._id, code: s.code, name: s.name, icon: s.icon, totalItems: total, completedItems: completed, progressPercent: total ? Math.round((completed / total) * 100) : 0 };
      }),
      continueLearning: contItem && contItem.status === 'published' ? { id: contItem._id, title: contItem.title, type: contItem.type, progressPct: cont!.progressPct } : null,
    });
  }),
);

studentRouter.get(
  '/activities',
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const q = parse(z.object({ status: z.enum(['pending', 'completed', 'all']).default('all') }), req.query);
    const [activities, completions] = await Promise.all([
      Activity.find(activityFilterFor(profile, req.school!.schoolId)).sort({ dueAt: 1 }).populate('subjectId', 'name code').populate('teacherId', 'name').populate('quizId', 'title version').lean(),
      ActivityCompletion.find({ studentId: req.auth!.userId }).lean(),
    ]);
    const cm = new Map(completions.map((c) => [c.activityId.toString(), c]));
    const attempts = await AssessmentAttempt.find({ studentId: req.auth!.userId, activityId: { $in: activities.map((a) => a._id) } })
      .sort({ submittedAt: 1 })
      .select('activityId percent score maxScore')
      .lean();
    // the first submission counts (same rule as the teacher's results view)
    const am = new Map<string, (typeof attempts)[number]>();
    attempts.forEach((a) => !am.has(a.activityId!.toString()) && am.set(a.activityId!.toString(), a));
    let rows = activities.map((a) => {
      const c = cm.get(a._id.toString());
      const t = am.get(a._id.toString());
      return {
        ...a,
        studentIds: undefined,
        completed: Boolean(c),
        completedAt: c?.completedAt ?? null,
        overdue: !c && a.dueAt < new Date(),
        result: t ? { percent: t.percent, score: t.score, maxScore: t.maxScore } : null,
        teacherFeedback: c?.teacherFeedback ?? null,
      };
    });
    if (q.status === 'pending') rows = rows.filter((r) => !r.completed);
    if (q.status === 'completed') rows = rows.filter((r) => r.completed);
    res.json(rows);
  }),
);

studentRouter.post(
  '/activities/:id/complete',
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const body = parse(z.object({ note: z.string().max(2000).optional() }), req.body);
    const activity = await Activity.findOne({ _id: oid(param(req, 'id')), ...activityFilterFor(profile, req.school!.schoolId) }).lean();
    if (!activity) throw notFound('Activity');
    if (activity.type === 'quiz') throw badRequest('Quiz activities are completed by submitting the quiz');
    if (activity.status === 'closed') throw badRequest('This activity is closed');
    const c = await ActivityCompletion.findOneAndUpdate(
      { activityId: activity._id, studentId: req.auth!.userId },
      { $setOnInsert: { schoolId: req.school!.schoolId, completedAt: new Date() }, $set: { note: body.note } },
      { upsert: true, new: true },
    ).lean();
    res.status(201).json(c);
  }),
);

studentRouter.get(
  '/progress',
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const q = parse(z.object({ range: z.enum(['7d', '30d', '90d', 'all']).default('30d') }), req.query);
    const studentId = req.auth!.userId;
    const days = { '7d': 7, '30d': 30, '90d': 90, all: 0 }[q.range];
    const since = days ? new Date(Date.now() - days * 86400000) : undefined;
    const match: Record<string, unknown> = { studentId, ...(since ? { submittedAt: { $gte: since } } : {}) };
    const [overall, subjects, history, completion, enrolments, programmes, access, certs, streak, badges, learned] = await Promise.all([
      A.performance(match),
      A.bySubject(match),
      AssessmentAttempt.find(match).sort({ submittedAt: -1 }).limit(30).select('-answers').populate('quizId', 'title').populate('subjectId', 'name').lean(),
      A.activityCompletion({ schoolId: req.school!.schoolId, classSectionId: profile.classSectionId }, studentId),
      ProgrammeEnrolment.find({ studentId }).lean(),
      Programme.find({ status: 'published' }).sort({ displayOrder: 1 }).lean(),
      programmeAccessMap(req.school!.schoolId),
      Certificate.find({ studentId }).sort({ level: 1 }).lean(),
      learningStreak(studentId, req.school!.timezone),
      earnedBadges(studentId, req.school!.timezone),
      LearningProgress.countDocuments({ studentId, status: 'completed', ...(since ? { completedAt: { $gte: since } } : {}) }),
    ]);
    const em = new Map(enrolments.map((e) => [e.programmeId.toString(), e]));
    res.json({
      range: q.range,
      rangeLabel: days ? `Last ${days} days` : 'All time',
      overall: { ...overall, completedActivities: completion.completed, learningItemsCompleted: learned },
      activityCompletion: completion,
      subjects,
      history,
      streak,
      programmes: programmes.map((p) => ({
        id: p._id,
        code: p.code,
        name: p.name,
        premium: p.premium,
        locked: !(access.get(p._id.toString())?.enabled ?? false),
        progressPercent: em.get(p._id.toString())?.progressPct ?? 0,
        enrolled: em.has(p._id.toString()),
      })),
      certification: { currentLevel: certs.reduce((m, c) => Math.max(m, c.level), 0), certificates: certs },
      badges: badges.filter((b) => b.earned),
      lockedBadges: badges.filter((b) => !b.earned).map(({ code, name, description }) => ({ code, name, description })),
    });
  }),
);

studentRouter.get(
  '/profile',
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const section = await ClassSection.findById(profile.classSectionId).lean();
    res.json({
      name: req.auth!.name,
      displayName: profile.displayName,
      avatar: profile.avatar,
      studentCode: profile.studentCode,
      levelNumber: profile.levelNumber,
      section: section?.sectionName,
      schoolName: req.school!.schoolName,
    });
  }),
);

studentRouter.patch(
  '/profile',
  ah(async (req, res) => {
    const body = parse(z.object({ displayName: z.string().min(1).max(40).optional(), avatar: z.string().max(30).optional() }), req.body);
    await StudentProfile.updateOne({ userId: req.auth!.userId, schoolId: req.school!.schoolId }, body);
    res.json({ ok: true });
  }),
);
