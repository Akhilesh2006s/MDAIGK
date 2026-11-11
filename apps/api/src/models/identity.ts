import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { CLASS_LEVELS, ENTITY_STATUS, PLAN_STATUS, ROLES } from '@mango/shared';

const ROLE_VALUES = Object.values(ROLES);
const opts = { timestamps: true } as const;

// ------------------------------------------------------------------ users
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_VALUES, required: true },
    status: { type: String, enum: ENTITY_STATUS, default: 'active' },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: Date,
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
  },
  opts,
);
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ name: 'text', email: 'text' });
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User = model('User', userSchema, 'users');

// ------------------------------------------------------------------ refresh tokens (rotation + revocation)
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedByHash: String,
    userAgent: String,
  },
  opts,
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshToken = model('RefreshToken', refreshTokenSchema, 'refresh_tokens');

// ------------------------------------------------------------------ schools
const schoolSchema = new Schema(
  {
    schoolCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    address: { type: String, trim: true, maxlength: 500 },
    city: { type: String, trim: true, maxlength: 100 },
    region: { type: String, trim: true, maxlength: 100 },
    contactPerson: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
    },
    status: { type: String, enum: ENTITY_STATUS, default: 'active' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currentAcademicYear: { type: String, default: '2026-27' },
    settings: {
      displayName: String,
      logoUrl: String,
      allowStudentLeaderboard: { type: Boolean, default: false },
    },
  },
  opts,
);
schoolSchema.index({ schoolCode: 1 }, { unique: true });
schoolSchema.index({ name: 'text', city: 'text', region: 'text', schoolCode: 'text' });
schoolSchema.index({ status: 1, createdAt: -1 });
export type SchoolDoc = InferSchemaType<typeof schoolSchema> & { _id: Types.ObjectId };
export const School = model('School', schoolSchema, 'schools');

// ------------------------------------------------------------------ memberships
const membershipSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: [ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.STUDENT], required: true },
    status: { type: String, enum: ENTITY_STATUS, default: 'active' },
  },
  opts,
);
membershipSchema.index({ schoolId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, status: 1 });
membershipSchema.index({ schoolId: 1, role: 1, status: 1 });
export const SchoolMembership = model('SchoolMembership', membershipSchema, 'school_memberships');

// ------------------------------------------------------------------ class levels (fixed 1–10, seeded)
const classLevelSchema = new Schema(
  {
    levelNumber: { type: Number, enum: CLASS_LEVELS, required: true },
    displayName: { type: String, required: true },
  },
  opts,
);
classLevelSchema.index({ levelNumber: 1 }, { unique: true });
export const ClassLevel = model('ClassLevel', classLevelSchema, 'class_levels');

// ------------------------------------------------------------------ school class access (entitlement — source of truth)
const classAccessSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    classLevelId: { type: Schema.Types.ObjectId, ref: 'ClassLevel', required: true },
    levelNumber: { type: Number, enum: CLASS_LEVELS, required: true },
    enabled: { type: Boolean, default: false },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    grantedAt: Date,
  },
  opts,
);
classAccessSchema.index({ schoolId: 1, levelNumber: 1 }, { unique: true });
export const SchoolClassAccess = model('SchoolClassAccess', classAccessSchema, 'school_class_access');

// ------------------------------------------------------------------ class sections
const sectionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    classLevelId: { type: Schema.Types.ObjectId, ref: 'ClassLevel', required: true },
    levelNumber: { type: Number, enum: CLASS_LEVELS, required: true },
    sectionName: { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
    academicYear: { type: String, required: true },
    status: { type: String, enum: ENTITY_STATUS, default: 'active' },
  },
  opts,
);
sectionSchema.index({ schoolId: 1, levelNumber: 1, sectionName: 1, academicYear: 1 }, { unique: true });
export const ClassSection = model('ClassSection', sectionSchema, 'class_sections');

// ------------------------------------------------------------------ teacher assignments
const teacherAssignmentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    classSectionId: { type: Schema.Types.ObjectId, ref: 'ClassSection', required: true },
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  },
  opts,
);
teacherAssignmentSchema.index({ teacherId: 1, classSectionId: 1 }, { unique: true });
teacherAssignmentSchema.index({ schoolId: 1, classSectionId: 1 });
export const TeacherAssignment = model('TeacherAssignment', teacherAssignmentSchema, 'teacher_assignments');

// ------------------------------------------------------------------ student profiles
const studentProfileSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    studentCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    classSectionId: { type: Schema.Types.ObjectId, ref: 'ClassSection', required: true },
    levelNumber: { type: Number, enum: CLASS_LEVELS, required: true },
    displayName: { type: String, trim: true, maxlength: 60 },
    avatar: { type: String, default: 'mango' },
    status: { type: String, enum: ENTITY_STATUS, default: 'active' },
  },
  opts,
);
studentProfileSchema.index({ schoolId: 1, studentCode: 1 }, { unique: true });
studentProfileSchema.index({ userId: 1 }, { unique: true });
studentProfileSchema.index({ schoolId: 1, classSectionId: 1, status: 1 });
export type StudentProfileDoc = InferSchemaType<typeof studentProfileSchema> & { _id: Types.ObjectId };
export const StudentProfile = model('StudentProfile', studentProfileSchema, 'student_profiles');

// ------------------------------------------------------------------ subscription plans
const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 500 },
    maxClassLevel: { type: Number, enum: CLASS_LEVELS, required: true },
    programmeCodes: [{ type: String }],
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active' },
  },
  opts,
);
planSchema.index({ name: 1 }, { unique: true });
export const SubscriptionPlan = model('SubscriptionPlan', planSchema, 'subscription_plans');

const schoolSubscriptionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: PLAN_STATUS, default: 'active' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  opts,
);
schoolSubscriptionSchema.index({ schoolId: 1, createdAt: -1 });
schoolSubscriptionSchema.index({ status: 1, endDate: 1 });
export const SchoolSubscription = model('SchoolSubscription', schoolSubscriptionSchema, 'school_subscriptions');
