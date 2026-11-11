import type { NextFunction, Request, Response } from 'express';
import { ROLES } from '@mango/shared';
import { currentStudent, resolveMemberSchool } from '../middleware/auth';
import { assertLevelEnabled } from '../services/access';

/** For routes shared by all roles: resolve the school context for everyone except Super Admin. */
export function memberSchoolUnlessSA(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role === ROLES.SUPER_ADMIN) return next();
  return resolveMemberSchool(req, res, next);
}

/** Authenticated student's profile, with the class-entitlement check applied. */
export async function studentCtx(req: Request) {
  const profile = await currentStudent(req);
  await assertLevelEnabled(req.school!.schoolId, profile.levelNumber);
  return profile;
}

export const isSA = (req: Request) => req.auth?.role === ROLES.SUPER_ADMIN;
export const isStudent = (req: Request) => req.auth?.role === ROLES.STUDENT;
export const isTeacher = (req: Request) => req.auth?.role === ROLES.TEACHER;
