import type { ClientSession, Types } from 'mongoose';
import { CLASS_LEVELS, ERROR_CODES } from '@mango/shared';
import {
  ClassLevel,
  ClassSection,
  Programme,
  SchoolClassAccess,
  SchoolProgrammeEntitlement,
  TeacherAssignment,
} from '../models';
import { AppError, forbidden, notFound } from '../utils/errors';

// ------------------------------------------------------------------ class entitlement
export async function enabledLevels(schoolId: Types.ObjectId): Promise<number[]> {
  const rows = await SchoolClassAccess.find({ schoolId, enabled: true }).select('levelNumber').lean();
  return rows.map((r) => r.levelNumber).sort((a, b) => a - b);
}

export async function isLevelEnabled(schoolId: Types.ObjectId, levelNumber: number) {
  return Boolean(await SchoolClassAccess.exists({ schoolId, levelNumber, enabled: true }));
}

export async function assertLevelEnabled(schoolId: Types.ObjectId, levelNumber: number) {
  if (!(await isLevelEnabled(schoolId, levelNumber))) {
    throw new AppError(403, ERROR_CODES.CLASS_LOCKED, `Class ${levelNumber} is not enabled for this school`);
  }
}

/** Replace a school's class access with exactly `levels` enabled. */
export async function setClassAccess(schoolId: Types.ObjectId, levels: number[], actorId: Types.ObjectId, session?: ClientSession) {
  const classLevels = await ClassLevel.find().session(session ?? null).lean();
  const byNumber = new Map(classLevels.map((c) => [c.levelNumber, c._id]));
  const now = new Date();
  await SchoolClassAccess.bulkWrite(
    CLASS_LEVELS.map((n) => ({
      updateOne: {
        filter: { schoolId, levelNumber: n },
        update: {
          $set: {
            enabled: levels.includes(n),
            classLevelId: byNumber.get(n),
            ...(levels.includes(n) ? { grantedBy: actorId, grantedAt: now } : {}),
          },
        },
        upsert: true,
      },
    })),
    { session },
  );
}

// ------------------------------------------------------------------ programme entitlement
export interface ProgrammeAccess {
  enabled: boolean;
  reason?: 'NOT_ENABLED' | 'EXPIRED' | 'NOT_STARTED' | 'CLASS_NOT_ELIGIBLE' | 'UNPUBLISHED';
  validUntil?: Date | null;
}

export function evaluateEntitlement(
  ent: { enabled?: boolean; validFrom?: Date | null; validUntil?: Date | null } | null | undefined,
  now = new Date(),
): ProgrammeAccess {
  if (!ent || !ent.enabled) return { enabled: false, reason: 'NOT_ENABLED' };
  if (ent.validFrom && ent.validFrom > now) return { enabled: false, reason: 'NOT_STARTED', validUntil: ent.validUntil };
  if (ent.validUntil && ent.validUntil < now) return { enabled: false, reason: 'EXPIRED', validUntil: ent.validUntil };
  return { enabled: true, validUntil: ent.validUntil };
}

export async function programmeAccessMap(schoolId: Types.ObjectId) {
  const ents = await SchoolProgrammeEntitlement.find({ schoolId }).lean();
  return new Map(ents.map((e) => [e.programmeId.toString(), evaluateEntitlement(e)]));
}

/** Throws PROGRAMME_LOCKED unless the school entitlement is valid and the student's class is eligible. */
export async function assertProgrammeAccess(schoolId: Types.ObjectId, programmeId: Types.ObjectId, levelNumber?: number) {
  const programme = await Programme.findById(programmeId).lean();
  if (!programme || programme.status !== 'published') throw notFound('Programme');
  const ent = await SchoolProgrammeEntitlement.findOne({ schoolId, programmeId }).lean();
  const access = evaluateEntitlement(ent);
  if (!access.enabled) {
    throw new AppError(403, ERROR_CODES.PROGRAMME_LOCKED, 'This programme is not enabled for your school', { reason: access.reason });
  }
  if (levelNumber && programme.classLevels?.length && !programme.classLevels.includes(levelNumber)) {
    throw new AppError(403, ERROR_CODES.PROGRAMME_LOCKED, 'This programme is not available for your class', { reason: 'CLASS_NOT_ELIGIBLE' });
  }
  return programme;
}

// ------------------------------------------------------------------ teacher scope
export async function teacherSectionIds(teacherId: Types.ObjectId, schoolId: Types.ObjectId) {
  const rows = await TeacherAssignment.find({ teacherId, schoolId }).select('classSectionId').lean();
  return rows.map((r) => r.classSectionId);
}

/** Teacher may only act on sections assigned to them whose class level is currently enabled. */
export async function assertTeacherSection(teacherId: Types.ObjectId, schoolId: Types.ObjectId, sectionId: Types.ObjectId) {
  const assignment = await TeacherAssignment.findOne({ teacherId, schoolId, classSectionId: sectionId }).lean();
  if (!assignment) throw forbidden('This class section is not assigned to you');
  const section = await ClassSection.findOne({ _id: sectionId, schoolId }).lean();
  if (!section) throw notFound('Class section');
  await assertLevelEnabled(schoolId, section.levelNumber);
  return { assignment, section };
}
