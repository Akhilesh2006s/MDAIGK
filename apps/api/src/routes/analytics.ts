import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@mango/shared';
import { authenticate, requireRole } from '../middleware/auth';
import { AssessmentAttempt, ClassSection, School, SchoolMembership, StudentProfile } from '../models';
import { teacherSectionIds } from '../services/access';
import * as A from '../services/analytics';
import { dateRange } from '../utils/dates';
import { forbidden, notFound } from '../utils/errors';
import { ah, oid, param, parse } from '../utils/http';
import { memberSchoolUnlessSA } from './helpers';

/**
 * /analytics/school|class|student — scoped analytics using the shared metric
 * definitions (platform analytics lives in platform.ts).
 */
export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.TEACHER), memberSchoolUnlessSA);

const rangeQuery = z.object({ from: z.string().optional(), to: z.string().optional() });

analyticsRouter.get(
  '/school/:schoolId',
  ah(async (req, res) => {
    const schoolId = oid(param(req, 'schoolId'));
    if (req.auth!.role === ROLES.TEACHER) throw forbidden();
    if (req.auth!.role === ROLES.SCHOOL_ADMIN && !req.school!.schoolId.equals(schoolId)) throw forbidden();
    if (!(await School.exists({ _id: schoolId }))) throw notFound('School');
    const q = parse(rangeQuery, req.query);
    const range = dateRange(q.from, q.to);
    const match = { schoolId, ...(range ? { submittedAt: range } : {}) };
    const [performance, subjects, classes, completion, programmes, games, certs, students, teachers] = await Promise.all([
      A.performance(match),
      A.bySubject(match),
      A.bySection(match, schoolId),
      A.activityCompletion({ schoolId }),
      A.programmeParticipation({ schoolId }),
      A.gameStats({ schoolId, ...(range ? { startedAt: range } : {}) }),
      A.certificatesIssued({ schoolId, ...(range ? { issuedAt: range } : {}) }),
      StudentProfile.countDocuments({ schoolId, status: 'active' }),
      SchoolMembership.countDocuments({ schoolId, role: ROLES.TEACHER, status: 'active' }),
    ]);
    res.json({ period: q, counts: { students, teachers, certificatesIssued: certs }, performance, subjects, classes, activityCompletion: completion, programmes, games });
  }),
);

analyticsRouter.get(
  '/class/:sectionId',
  ah(async (req, res) => {
    const sectionId = oid(param(req, 'sectionId'));
    const section = await ClassSection.findById(sectionId).lean();
    if (!section) throw notFound('Class section');
    if (req.auth!.role !== ROLES.SUPER_ADMIN && !section.schoolId.equals(req.school!.schoolId)) throw notFound('Class section');
    if (req.auth!.role === ROLES.TEACHER) {
      const mine = await teacherSectionIds(req.auth!.userId, req.school!.schoolId);
      if (!mine.some((m) => m.equals(sectionId))) throw forbidden('This class is not assigned to you');
    }
    const q = parse(rangeQuery, req.query);
    const range = dateRange(q.from, q.to);
    const match = { classSectionId: sectionId, ...(range ? { submittedAt: range } : {}) };
    const [performance, subjects, completion, students] = await Promise.all([
      A.performance(match),
      A.bySubject(match),
      A.activityCompletion({ classSectionId: sectionId }),
      StudentProfile.countDocuments({ classSectionId: sectionId, status: 'active' }),
    ]);
    res.json({ section: { id: section._id, label: `Class ${section.levelNumber}-${section.sectionName}` }, period: q, students, performance, subjects, activityCompletion: completion });
  }),
);

analyticsRouter.get(
  '/student/:studentId',
  ah(async (req, res) => {
    const studentId = oid(param(req, 'studentId'));
    const profile = await StudentProfile.findOne({ userId: studentId }).lean();
    if (!profile) throw notFound('Student');
    if (req.auth!.role !== ROLES.SUPER_ADMIN && !profile.schoolId.equals(req.school!.schoolId)) throw notFound('Student');
    if (req.auth!.role === ROLES.TEACHER) {
      const mine = await teacherSectionIds(req.auth!.userId, req.school!.schoolId);
      if (!mine.some((m) => m.equals(profile.classSectionId))) throw forbidden('This student is not in your assigned classes');
    }
    const q = parse(rangeQuery, req.query);
    const range = dateRange(q.from, q.to);
    const match = { studentId, ...(range ? { submittedAt: range } : {}) };
    const [performance, subjects, completion, history] = await Promise.all([
      A.performance(match),
      A.bySubject(match),
      A.activityCompletion({ classSectionId: profile.classSectionId }, studentId),
      AssessmentAttempt.find(match).sort({ submittedAt: -1 }).limit(50).select('-answers').lean(),
    ]);
    res.json({ period: q, performance, subjects, activityCompletion: completion, history });
  }),
);
