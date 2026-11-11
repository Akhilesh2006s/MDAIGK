import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { ERROR_CODES, ROLES, SCHOOL_HEADER, type Role } from '@mango/shared';
import { env } from '../config/env';
import { School, SchoolMembership, StudentProfile, User } from '../models';
import { AppError, forbidden, unauthenticated } from '../utils/errors';
import { ah, param } from '../utils/http';

export interface AuthContext {
  userId: Types.ObjectId;
  role: Role;
  name: string;
}

export interface SchoolContext {
  schoolId: Types.ObjectId;
  schoolName: string;
  timezone: string;
  academicYear: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      school?: SchoolContext;
    }
  }
}

interface AccessTokenPayload {
  sub: string;
  role: Role;
  typ: 'access';
}

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role, typ: 'access' } satisfies AccessTokenPayload, env().JWT_ACCESS_SECRET, {
    expiresIn: env().ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** Verifies the bearer token AND that the account is still active. */
export const authenticate = ah(async (req: Request, _res: Response, next: NextFunction) => {
  if (req.auth) return next(); // already verified by an outer router
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthenticated();
  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env().JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new AppError(401, ERROR_CODES.TOKEN_EXPIRED, 'Access token expired');
    throw unauthenticated('Invalid access token');
  }
  if (payload.typ !== 'access' || !Types.ObjectId.isValid(payload.sub)) throw unauthenticated('Invalid access token');
  const user = await User.findById(payload.sub).select('name role status').lean();
  if (!user) throw unauthenticated('Account not found');
  if (user.status !== 'active') throw new AppError(401, ERROR_CODES.ACCOUNT_INACTIVE, 'Account is inactive');
  req.auth = { userId: user._id, role: user.role as Role, name: user.name };
  next();
});

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthenticated());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };

async function loadSchool(schoolId: Types.ObjectId): Promise<SchoolContext> {
  const school = await School.findById(schoolId).select('name status timezone currentAcademicYear').lean();
  if (!school) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'School not found');
  if (school.status !== 'active') throw new AppError(403, ERROR_CODES.SCHOOL_INACTIVE, 'School is inactive');
  return {
    schoolId: school._id,
    schoolName: school.name,
    timezone: school.timezone || env().DEFAULT_TIMEZONE,
    academicYear: school.currentAcademicYear || '2026-27',
  };
}

/**
 * Resolves the active school for school-member roles (School Admin, Teacher, Student).
 * A user with several active memberships must choose one with the x-school-id header.
 */
export const resolveMemberSchool = ah(async (req: Request, _res: Response, next: NextFunction) => {
  if (req.school) return next();
  const auth = req.auth!;
  if (auth.role === ROLES.SUPER_ADMIN) throw forbidden('Super Admin must use platform routes with an explicit school id');
  const memberships = await SchoolMembership.find({ userId: auth.userId, status: 'active', role: auth.role }).select('schoolId').lean();
  if (!memberships.length) throw forbidden('No active school membership');
  const requested = req.header(SCHOOL_HEADER);
  let chosen: Types.ObjectId | undefined;
  if (requested) {
    chosen = memberships.find((m) => m.schoolId.toString() === requested)?.schoolId;
    if (!chosen) throw forbidden('You are not a member of the selected school');
  } else if (memberships.length === 1) {
    chosen = memberships[0].schoolId;
  } else {
    throw new AppError(400, ERROR_CODES.SCHOOL_CONTEXT_REQUIRED, `Select a school with the ${SCHOOL_HEADER} header`);
  }
  req.school = await loadSchool(chosen);
  next();
});

/**
 * For routes shaped /schools/:schoolId/... — Super Admin may access any school,
 * School Admin only a school where they hold an active SCHOOL_ADMIN membership.
 */
export const schoolParamAccess = (paramName = 'schoolId') =>
  ah(async (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth!;
    const raw = param(req, paramName);
    if (!Types.ObjectId.isValid(raw)) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'School not found');
    const schoolId = new Types.ObjectId(raw);
    if (auth.role === ROLES.SUPER_ADMIN) {
      const school = await School.findById(schoolId).select('name timezone currentAcademicYear').lean();
      if (!school) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'School not found');
      req.school = {
        schoolId,
        schoolName: school.name,
        timezone: school.timezone || env().DEFAULT_TIMEZONE,
        academicYear: school.currentAcademicYear || '2026-27',
      };
      return next();
    }
    if (auth.role !== ROLES.SCHOOL_ADMIN) throw forbidden();
    const m = await SchoolMembership.exists({ userId: auth.userId, schoolId, role: ROLES.SCHOOL_ADMIN, status: 'active' });
    if (!m) throw forbidden('You do not administer this school');
    req.school = await loadSchool(schoolId);
    next();
  });

/** Loads the authenticated student's profile (must be active and in the resolved school). */
export async function currentStudent(req: Request) {
  const profile = await StudentProfile.findOne({ userId: req.auth!.userId, schoolId: req.school!.schoolId, status: 'active' }).lean();
  if (!profile) throw forbidden('Student profile is not active in this school');
  return profile;
}
