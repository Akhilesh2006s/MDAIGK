import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ACTIVITY_TYPES, ROLES } from '@mango/shared';
import { authenticate, requireRole, resolveMemberSchool } from '../middleware/auth';
import {
  Activity,
  ActivityCompletion,
  AssessmentAttempt,
  Certificate,
  LearningItem,
  LearningProgress,
  ProgrammeEnrolment,
  Quiz,
  QuizVersion,
  StudentProfile,
  Subject,
  TeacherAssignment,
} from '../models';
import { assertTeacherSection, enabledLevels } from '../services/access';
import * as A from '../services/analytics';
import { audit, notify } from '../utils/audit';
import { dateRange } from '../utils/dates';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { ah, escapeRegex, objectId, oid, param, parse } from '../utils/http';

export const teacherRouter = Router();
teacherRouter.use(authenticate, requireRole(ROLES.TEACHER), resolveMemberSchool);

const tid = (req: Request) => req.auth!.userId;
const sid = (req: Request) => req.school!.schoolId;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Assigned sections whose class level is currently enabled for the school. */
async function myAssignments(req: Request) {
  const [assignments, levels] = await Promise.all([
    TeacherAssignment.find({ teacherId: tid(req), schoolId: sid(req) }).populate('classSectionId').populate('subjectIds', 'name code icon').lean(),
    enabledLevels(sid(req)),
  ]);
  return assignments
    .filter((a) => a.classSectionId && (a.classSectionId as unknown as { status: string }).status === 'active')
    .map((a) => {
      const s = a.classSectionId as unknown as { _id: Types.ObjectId; levelNumber: number; sectionName: string; academicYear: string };
      return {
        sectionId: s._id,
        label: `Class ${s.levelNumber}-${s.sectionName}`,
        levelNumber: s.levelNumber,
        sectionName: s.sectionName,
        academicYear: s.academicYear,
        locked: !levels.includes(s.levelNumber),
        subjects: a.subjectIds as unknown as Array<{ _id: Types.ObjectId; name: string; code: string }>,
      };
    });
}

async function studentInMySections(req: Request, studentId: Types.ObjectId) {
  const profile = await StudentProfile.findOne({ userId: studentId, schoolId: sid(req) }).populate('userId', 'name lastLoginAt').lean();
  if (!profile) throw notFound('Student');
  await assertTeacherSection(tid(req), sid(req), profile.classSectionId);
  return profile;
}

// ------------------------------------------------------------------ home
teacherRouter.get(
  '/home',
  ah(async (req, res) => {
    const classes = (await myAssignments(req)).filter((c) => !c.locked);
    const sectionIds = classes.map((c) => c.sectionId);
    const [counts, perf, myActivities] = await Promise.all([
      StudentProfile.aggregate([{ $match: { classSectionId: { $in: sectionIds }, status: 'active' } }, { $group: { _id: '$classSectionId', n: { $sum: 1 } } }]),
      AssessmentAttempt.aggregate([{ $match: { classSectionId: { $in: sectionIds } } }, { $group: { _id: '$classSectionId', avg: { $avg: '$percent' }, n: { $sum: 1 } } }]),
      Activity.find({ teacherId: tid(req), schoolId: sid(req), status: 'published' }).select('_id type title dueAt classSectionId').lean(),
    ]);
    const pendingReviews = await ActivityCompletion.countDocuments({
      activityId: { $in: myActivities.filter((a) => a.type !== 'quiz').map((a) => a._id) },
      reviewedAt: null,
    });
    const cm = new Map(counts.map((c) => [c._id.toString(), c.n]));
    const pm = new Map(perf.map((p) => [p._id.toString(), p]));
    const now = new Date();
    res.json({
      teacher: { name: req.auth!.name, schoolName: req.school!.schoolName },
      totals: {
        classes: classes.length,
        students: [...cm.values()].reduce((a, b) => a + b, 0),
        pendingReviews,
        activeActivities: myActivities.filter((a) => a.dueAt >= now).length,
      },
      classes: classes.map((c) => ({
        ...c,
        studentCount: cm.get(c.sectionId.toString()) ?? 0,
        averagePercent: pm.get(c.sectionId.toString()) ? round1(pm.get(c.sectionId.toString()).avg) : null,
        sampleSize: pm.get(c.sectionId.toString())?.n ?? 0,
      })),
      upcoming: myActivities
        .filter((a) => a.dueAt >= now)
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
        .slice(0, 5),
    });
  }),
);

teacherRouter.get(
  '/classes',
  ah(async (req, res) => {
    res.json(await myAssignments(req));
  }),
);

teacherRouter.get(
  '/classes/:sectionId/students',
  ah(async (req, res) => {
    const sectionId = oid(param(req, 'sectionId'));
    await assertTeacherSection(tid(req), sid(req), sectionId);
    const q = parse(z.object({ q: z.string().max(100).optional() }), req.query);
    const profiles = await StudentProfile.find({ classSectionId: sectionId, schoolId: sid(req), status: 'active' }).populate('userId', 'name lastLoginAt').sort({ studentCode: 1 }).lean();
    const ids = profiles.map((p) => (p.userId as unknown as { _id: Types.ObjectId })._id);
    const [perf, certs] = await Promise.all([
      AssessmentAttempt.aggregate([{ $match: { studentId: { $in: ids } } }, { $group: { _id: '$studentId', avg: { $avg: '$percent' }, n: { $sum: 1 } } }]),
      Certificate.aggregate([{ $match: { studentId: { $in: ids } } }, { $group: { _id: '$studentId', top: { $max: '$level' } } }]),
    ]);
    const pm = new Map(perf.map((p) => [p._id.toString(), p]));
    const cm = new Map(certs.map((c) => [c._id.toString(), c.top]));
    let rows = profiles.map((p) => {
      const u = p.userId as unknown as { _id: Types.ObjectId; name: string; lastLoginAt?: Date };
      return {
        id: u._id,
        name: u.name,
        displayName: p.displayName,
        studentCode: p.studentCode,
        averagePercent: pm.get(u._id.toString()) ? round1(pm.get(u._id.toString()).avg) : null,
        attempts: pm.get(u._id.toString())?.n ?? 0,
        certificationLevel: cm.get(u._id.toString()) ?? 0,
        lastLoginAt: u.lastLoginAt,
      };
    });
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      rows = rows.filter((r) => rx.test(r.name) || rx.test(r.studentCode));
    }
    res.json(rows);
  }),
);

teacherRouter.get(
  '/students/:studentId',
  ah(async (req, res) => {
    const studentId = oid(param(req, 'studentId'));
    const profile = await studentInMySections(req, studentId);
    const match = { studentId, schoolId: sid(req) };
    const [performance, subjects, recentAttempts, learning, certificates, programmes, completion] = await Promise.all([
      A.performance(match),
      A.bySubject(match),
      AssessmentAttempt.find(match).sort({ submittedAt: -1 }).limit(20).populate('quizId', 'title').populate('subjectId', 'name').select('-answers').lean(),
      LearningProgress.find({ studentId }).sort({ lastOpenedAt: -1 }).limit(20).populate('learningItemId', 'title type').populate('subjectId', 'name').lean(),
      Certificate.find({ studentId }).sort({ level: 1 }).lean(),
      ProgrammeEnrolment.find({ studentId }).populate('programmeId', 'name code premium').lean(),
      A.activityCompletion({ schoolId: sid(req), classSectionId: profile.classSectionId }, studentId),
    ]);
    res.json({ profile, performance, subjects, recentAttempts, learningHistory: learning, certificates, programmes, activityCompletion: completion });
  }),
);

// ------------------------------------------------------------------ activities
const activityBody = z.object({
  classSectionId: objectId,
  studentIds: z.array(objectId).max(200).default([]),
  subjectId: objectId,
  type: z.enum(ACTIVITY_TYPES),
  title: z.string().min(2).max(200),
  instructions: z.string().max(4000).optional(),
  quizId: objectId.optional(),
  learningItemId: objectId.optional(),
  worksheetRef: z.string().max(1000).optional(),
  startAt: z.coerce.date(),
  dueAt: z.coerce.date(),
  publish: z.boolean().default(false),
});

async function validateActivity(req: Request, body: Partial<z.infer<typeof activityBody>> & { classSectionId: string; subjectId: string; type: string }) {
  const { assignment, section } = await assertTeacherSection(tid(req), sid(req), oid(body.classSectionId));
  if (!assignment.subjectIds.some((s) => s.equals(oid(body.subjectId)))) throw forbidden('You are not assigned to teach this subject in this class');
  if (body.startAt && body.dueAt && body.dueAt <= body.startAt) throw badRequest('Due date must be after start date');
  if (body.studentIds?.length) {
    const n = await StudentProfile.countDocuments({ userId: { $in: body.studentIds.map(oid) }, classSectionId: section._id, status: 'active' });
    if (n !== body.studentIds.length) throw badRequest('All selected students must belong to this class section');
  }
  if (body.type === 'quiz') {
    if (!body.quizId) throw badRequest('A quiz activity needs a quiz');
    const quiz = await Quiz.findById(oid(body.quizId)).lean();
    const ok = quiz && quiz.status === 'published' && (!quiz.schoolId || quiz.schoolId.equals(sid(req))) && quiz.context !== 'certification';
    if (!ok) throw badRequest('Quiz is not available');
  }
  if (body.type === 'worksheet' && !body.worksheetRef && !body.instructions) throw badRequest('A worksheet needs a reference or instructions');
  if (body.learningItemId && !(await LearningItem.exists({ _id: oid(body.learningItemId), status: 'published' }))) throw badRequest('Learning item is not available');
  return section;
}

async function notifyRecipients(activity: { _id: Types.ObjectId; classSectionId: Types.ObjectId; studentIds?: Types.ObjectId[]; title: string; dueAt: Date }, schoolId: Types.ObjectId) {
  const recipients = activity.studentIds?.length
    ? activity.studentIds
    : (await StudentProfile.find({ classSectionId: activity.classSectionId, status: 'active' }).select('userId').lean()).map((p) => p.userId);
  await notify(recipients, { title: `New activity: ${activity.title}`, body: `Due ${activity.dueAt.toDateString()}`, type: 'activity', schoolId, link: `activity/${activity._id}` });
}

teacherRouter.get(
  '/activities',
  ah(async (req, res) => {
    const q = parse(z.object({ sectionId: objectId.optional(), status: z.enum(['draft', 'published', 'closed']).optional() }), req.query);
    const filter: Record<string, unknown> = { teacherId: tid(req), schoolId: sid(req) };
    if (q.sectionId) filter.classSectionId = oid(q.sectionId);
    if (q.status) filter.status = q.status;
    const items = await Activity.find(filter).sort({ createdAt: -1 }).limit(200).populate('subjectId', 'name code').populate('classSectionId', 'levelNumber sectionName').lean();
    const completions = await ActivityCompletion.aggregate([{ $match: { activityId: { $in: items.map((i) => i._id) } } }, { $group: { _id: '$activityId', n: { $sum: 1 } } }]);
    const cm = new Map(completions.map((c) => [c._id.toString(), c.n]));
    const sectionCounts = await StudentProfile.aggregate([
      { $match: { classSectionId: { $in: items.map((i) => (i.classSectionId as unknown as { _id: Types.ObjectId })._id) }, status: 'active' } },
      { $group: { _id: '$classSectionId', n: { $sum: 1 } } },
    ]);
    const sc = new Map(sectionCounts.map((s) => [s._id.toString(), s.n]));
    res.json(
      items.map((i) => ({
        ...i,
        completedCount: cm.get(i._id.toString()) ?? 0,
        recipientCount: i.studentIds?.length || sc.get((i.classSectionId as unknown as { _id: Types.ObjectId })._id.toString()) || 0,
      })),
    );
  }),
);

teacherRouter.post(
  '/activities',
  ah(async (req, res) => {
    const body = parse(activityBody, req.body);
    await validateActivity(req, body);
    const activity = await Activity.create({
      schoolId: sid(req),
      teacherId: tid(req),
      classSectionId: oid(body.classSectionId),
      studentIds: body.studentIds.map(oid),
      subjectId: oid(body.subjectId),
      type: body.type,
      title: body.title,
      instructions: body.instructions,
      quizId: body.quizId ? oid(body.quizId) : undefined,
      learningItemId: body.learningItemId ? oid(body.learningItemId) : undefined,
      worksheetRef: body.worksheetRef,
      startAt: body.startAt,
      dueAt: body.dueAt,
      status: body.publish ? 'published' : 'draft',
      publishedAt: body.publish ? new Date() : undefined,
    });
    if (body.publish) await notifyRecipients(activity, sid(req));
    await audit(req, { action: body.publish ? 'activity.publish' : 'activity.create', entityType: 'activity', entityId: activity._id, schoolId: sid(req) });
    res.status(201).json(activity);
  }),
);

async function myActivity(req: Request) {
  const a = await Activity.findOne({ _id: oid(param(req, 'id')), teacherId: tid(req), schoolId: sid(req) });
  if (!a) throw notFound('Activity');
  return a;
}

teacherRouter.get(
  '/activities/:id',
  ah(async (req, res) => {
    const a = await myActivity(req);
    await a.populate([{ path: 'subjectId', select: 'name code' }, { path: 'classSectionId', select: 'levelNumber sectionName' }, { path: 'quizId', select: 'title version' }]);
    res.json(a);
  }),
);

teacherRouter.patch(
  '/activities/:id',
  ah(async (req, res) => {
    const body = parse(activityBody.partial().omit({ publish: true }), req.body);
    const a = await myActivity(req);
    if (a.status === 'closed') throw conflict('Closed activities cannot be edited');
    if (a.status === 'published' && (body.classSectionId || body.type || body.quizId)) throw conflict('Section, type and quiz cannot change after publishing');
    const merged = {
      classSectionId: body.classSectionId ?? a.classSectionId.toString(),
      subjectId: body.subjectId ?? a.subjectId.toString(),
      type: body.type ?? a.type,
      studentIds: body.studentIds,
      quizId: body.quizId ?? a.quizId?.toString(),
      worksheetRef: body.worksheetRef ?? a.worksheetRef ?? undefined,
      instructions: body.instructions ?? a.instructions ?? undefined,
      startAt: body.startAt ?? a.startAt,
      dueAt: body.dueAt ?? a.dueAt,
      learningItemId: body.learningItemId,
    };
    await validateActivity(req, merged);
    a.set({
      ...body,
      ...(body.classSectionId ? { classSectionId: oid(body.classSectionId) } : {}),
      ...(body.subjectId ? { subjectId: oid(body.subjectId) } : {}),
      ...(body.studentIds ? { studentIds: body.studentIds.map(oid) } : {}),
      ...(body.quizId ? { quizId: oid(body.quizId) } : {}),
      ...(body.learningItemId ? { learningItemId: oid(body.learningItemId) } : {}),
    });
    await a.save();
    res.json(a);
  }),
);

teacherRouter.post(
  '/activities/:id/publish',
  ah(async (req, res) => {
    const a = await myActivity(req);
    if (a.status !== 'draft') throw conflict('Only draft activities can be published');
    await validateActivity(req, { ...a.toObject(), classSectionId: a.classSectionId.toString(), subjectId: a.subjectId.toString(), quizId: a.quizId?.toString(), studentIds: a.studentIds.map(String), worksheetRef: a.worksheetRef ?? undefined, instructions: a.instructions ?? undefined, learningItemId: undefined });
    a.status = 'published';
    a.publishedAt = new Date();
    await a.save();
    await notifyRecipients(a, sid(req));
    await audit(req, { action: 'activity.publish', entityType: 'activity', entityId: a._id, schoolId: sid(req) });
    res.json(a);
  }),
);

teacherRouter.post(
  '/activities/:id/close',
  ah(async (req, res) => {
    const a = await myActivity(req);
    a.status = 'closed';
    await a.save();
    res.json(a);
  }),
);

teacherRouter.get(
  '/activities/:id/results',
  ah(async (req, res) => {
    const a = await myActivity(req);
    const recipients = a.studentIds.length
      ? await StudentProfile.find({ userId: { $in: a.studentIds }, schoolId: sid(req) }).populate('userId', 'name').lean()
      : await StudentProfile.find({ classSectionId: a.classSectionId, status: 'active' }).populate('userId', 'name').lean();
    const [completions, attempts] = await Promise.all([
      ActivityCompletion.find({ activityId: a._id }).lean(),
      AssessmentAttempt.find({ activityId: a._id }).sort({ submittedAt: 1 }).lean(),
    ]);
    const comp = new Map(completions.map((c) => [c.studentId.toString(), c]));
    const firstAttempt = new Map<string, (typeof attempts)[number]>();
    attempts.forEach((t) => !firstAttempt.has(t.studentId.toString()) && firstAttempt.set(t.studentId.toString(), t));

    // incorrect-answer review: per question, how many answered wrongly (scored against each attempt's version)
    let questionReview: Array<{ questionId: string; prompt: string; correctIndex: number; options: string[]; wrongCount: number; answered: number }> = [];
    if (a.quizId && attempts.length) {
      const versions = await QuizVersion.find({ quizId: a.quizId }).lean();
      const prompt = new Map<string, { prompt: string; correctIndex: number; options: string[] }>();
      versions.forEach((v) => v.questions.forEach((q) => prompt.set(q._id.toString(), { prompt: q.prompt, correctIndex: q.correctIndex, options: q.options })));
      const stats = new Map<string, { wrong: number; answered: number }>();
      firstAttempt.forEach((t) =>
        t.answers.forEach((ans) => {
          const k = ans.questionId!.toString();
          const s = stats.get(k) ?? { wrong: 0, answered: 0 };
          s.answered++;
          if (!ans.correct) s.wrong++;
          stats.set(k, s);
        }),
      );
      questionReview = [...stats.entries()]
        .map(([k, s]) => ({ questionId: k, prompt: prompt.get(k)?.prompt ?? '', correctIndex: prompt.get(k)?.correctIndex ?? -1, options: prompt.get(k)?.options ?? [], wrongCount: s.wrong, answered: s.answered }))
        .sort((x, y) => y.wrongCount - x.wrongCount);
    }
    const students = recipients.map((p) => {
      const u = p.userId as unknown as { _id: Types.ObjectId; name: string };
      const c = comp.get(u._id.toString());
      const t = firstAttempt.get(u._id.toString());
      return {
        studentId: u._id,
        name: u.name,
        studentCode: p.studentCode,
        completed: Boolean(c),
        completedAt: c?.completedAt ?? null,
        late: c ? c.completedAt! > a.dueAt : false,
        score: t?.score ?? null,
        maxScore: t?.maxScore ?? null,
        percent: t?.percent ?? null,
        note: c?.note ?? null,
        reviewedAt: c?.reviewedAt ?? null,
        teacherFeedback: c?.teacherFeedback ?? null,
      };
    });
    const scored = students.filter((s) => s.percent !== null);
    res.json({
      activity: a,
      summary: {
        recipients: students.length,
        completed: students.filter((s) => s.completed).length,
        completionPercent: students.length ? round1((students.filter((s) => s.completed).length / students.length) * 100) : null,
        averagePercent: scored.length ? round1(scored.reduce((m, s) => m + (s.percent ?? 0), 0) / scored.length) : null,
      },
      students,
      questionReview,
    });
  }),
);

teacherRouter.post(
  '/activities/:id/completions/:studentId/review',
  ah(async (req, res) => {
    const a = await myActivity(req);
    const { feedback } = parse(z.object({ feedback: z.string().max(2000).default('') }), req.body);
    const c = await ActivityCompletion.findOneAndUpdate(
      { activityId: a._id, studentId: oid(param(req, 'studentId')) },
      { reviewedAt: new Date(), reviewedBy: tid(req), teacherFeedback: feedback },
      { new: true },
    ).lean();
    if (!c) throw notFound('Submission');
    await notify([c.studentId], { title: `Your teacher reviewed "${a.title}"`, body: feedback || undefined, type: 'review', schoolId: sid(req) });
    res.json(c);
  }),
);

// ------------------------------------------------------------------ performance & insights
teacherRouter.get(
  '/performance',
  ah(async (req, res) => {
    const q = parse(z.object({ sectionId: objectId.optional(), subjectId: objectId.optional(), from: z.string().optional(), to: z.string().optional() }), req.query);
    const classes = (await myAssignments(req)).filter((c) => !c.locked);
    let sectionIds = classes.map((c) => c.sectionId);
    if (q.sectionId) {
      await assertTeacherSection(tid(req), sid(req), oid(q.sectionId));
      sectionIds = [oid(q.sectionId)];
    }
    const match: Record<string, unknown> = { schoolId: sid(req), classSectionId: { $in: sectionIds } };
    const range = dateRange(q.from, q.to);
    if (range) match.submittedAt = range;
    // only subjects this teacher teaches (in the selected sections)
    const mySubjects = classes
      .filter((c) => sectionIds.some((s) => s.equals(c.sectionId)))
      .flatMap((c) => c.subjects.map((s) => s._id));
    if (q.subjectId) {
      if (!mySubjects.some((s) => s.equals(oid(q.subjectId!)))) throw forbidden('You do not teach this subject');
      match.subjectId = oid(q.subjectId);
    } else {
      match.subjectId = { $in: mySubjects };
    }
    const [summary, subjects, completion, weeklyDesc] = await Promise.all([
      A.performance(match),
      A.bySubject(match),
      A.activityCompletion({ schoolId: sid(req), teacherId: tid(req), classSectionId: { $in: sectionIds } }),
      AssessmentAttempt.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$submittedAt' } }, avg: { $avg: '$percent' }, n: { $sum: 1 } } },
        { $sort: { _id: -1 } }, // latest 26 weeks…
        { $limit: 26 },
      ]),
    ]);
    const weekly = weeklyDesc.reverse(); // …returned oldest → newest for charting
    const mySubjectIds = new Set(classes.flatMap((c) => c.subjects.map((s) => s._id.toString())));
    res.json({
      period: { from: q.from ?? null, to: q.to ?? null },
      summary,
      activityCompletion: completion,
      subjects: subjects.filter((s) => mySubjectIds.has(s.subjectId.toString())),
      trend: weekly.map((w) => ({ week: w._id, averagePercent: round1(w.avg), attempts: w.n })),
    });
  }),
);

teacherRouter.get(
  '/insights',
  ah(async (req, res) => {
    const q = parse(z.object({ sectionId: objectId.optional() }), req.query);
    const classes = (await myAssignments(req)).filter((c) => !c.locked);
    let sectionIds = classes.map((c) => c.sectionId);
    if (q.sectionId) {
      await assertTeacherSection(tid(req), sid(req), oid(q.sectionId));
      sectionIds = [oid(q.sectionId)];
    }
    const since = new Date(Date.now() - 60 * 86400000);
    const rows = await AssessmentAttempt.aggregate([
      { $match: { schoolId: sid(req), classSectionId: { $in: sectionIds }, submittedAt: { $gte: since } } },
      { $group: { _id: '$studentId', avg: { $avg: '$percent' }, n: { $sum: 1 } } },
    ]);
    const profiles = await StudentProfile.find({ classSectionId: { $in: sectionIds }, status: 'active' }).populate('userId', 'name').populate('classSectionId', 'levelNumber sectionName').lean();
    const pm = new Map(rows.map((r) => [r._id.toString(), r]));
    const students = profiles.map((p) => {
      const u = p.userId as unknown as { _id: Types.ObjectId; name: string };
      const s = p.classSectionId as unknown as { levelNumber: number; sectionName: string };
      const r = pm.get(u._id.toString());
      return { studentId: u._id, name: u.name, class: `${s.levelNumber}-${s.sectionName}`, averagePercent: r ? round1(r.avg) : null, attempts: r?.n ?? 0 };
    });
    const withData = students.filter((s) => s.attempts >= 1);
    res.json({
      window: 'Last 60 days',
      rule: 'Needs support: average below 50% over at least 2 attempts, or no attempts in the window.',
      topPerformers: [...withData].sort((a, b) => (b.averagePercent ?? 0) - (a.averagePercent ?? 0)).slice(0, 5),
      needsSupport: students
        .filter((s) => s.attempts === 0 || (s.attempts >= 2 && (s.averagePercent ?? 0) < 50))
        .sort((a, b) => (a.averagePercent ?? -1) - (b.averagePercent ?? -1))
        .slice(0, 10),
    });
  }),
);

teacherRouter.get(
  '/subjects',
  ah(async (req, res) => {
    const classes = await myAssignments(req);
    const ids = [...new Set(classes.flatMap((c) => c.subjects.map((s) => s._id.toString())))];
    res.json(await Subject.find({ _id: { $in: ids } }).sort({ displayOrder: 1 }).lean());
  }),
);

