import { Schema, model } from 'mongoose';
import { ACTIVITY_STATUS, ACTIVITY_TYPES, GAME_OUTCOMES } from '@mango/shared';

const opts = { timestamps: true } as const;

// ------------------------------------------------------------------ teacher activities
const activitySchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    classSectionId: { type: Schema.Types.ObjectId, ref: 'ClassSection', required: true },
    /** empty = whole section */
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, maxlength: 4000 },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
    learningItemId: { type: Schema.Types.ObjectId, ref: 'LearningItem' },
    worksheetRef: { type: String, maxlength: 1000 },
    startAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: ACTIVITY_STATUS, default: 'draft' },
    publishedAt: Date,
  },
  opts,
);
activitySchema.index({ schoolId: 1, classSectionId: 1, status: 1, dueAt: -1 });
activitySchema.index({ teacherId: 1, createdAt: -1 });
export const Activity = model('Activity', activitySchema, 'activities');

const activityCompletionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attemptId: { type: Schema.Types.ObjectId, ref: 'AssessmentAttempt' },
    note: { type: String, maxlength: 2000 },
    completedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    teacherFeedback: { type: String, maxlength: 2000 },
  },
  opts,
);
activityCompletionSchema.index({ activityId: 1, studentId: 1 }, { unique: true });
activityCompletionSchema.index({ studentId: 1, completedAt: -1 });
export const ActivityCompletion = model('ActivityCompletion', activityCompletionSchema, 'activity_completions');

// ------------------------------------------------------------------ assessment attempts
const attemptSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    quizVersion: { type: Number, required: true },
    context: { type: String, enum: ['learning', 'news', 'activity', 'certification', 'programme'], required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity' },
    certificationLevelId: { type: Schema.Types.ObjectId, ref: 'CertificationLevel' },
    classSectionId: { type: Schema.Types.ObjectId, ref: 'ClassSection' },
    /** client-generated idempotency key — duplicate submissions are rejected */
    clientAttemptId: { type: String, required: true },
    answers: [{ questionId: Schema.Types.ObjectId, selectedIndex: Number, correct: Boolean, marksAwarded: Number }],
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    correctCount: Number,
    questionCount: Number,
    percent: Number,
    durationSec: Number,
    submittedAt: { type: Date, default: Date.now },
  },
  opts,
);
attemptSchema.index({ studentId: 1, clientAttemptId: 1 }, { unique: true });
attemptSchema.index({ studentId: 1, submittedAt: -1 });
attemptSchema.index({ schoolId: 1, classSectionId: 1, submittedAt: -1 });
attemptSchema.index({ activityId: 1, studentId: 1 });
export const AssessmentAttempt = model('AssessmentAttempt', attemptSchema, 'assessment_attempts');

// ------------------------------------------------------------------ games: atomic daily counter + attempt log
const gameDailyUsageSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, required: true },
    gameId: { type: Schema.Types.ObjectId, required: true },
    localDateKey: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  opts,
);
gameDailyUsageSchema.index({ studentId: 1, gameId: 1, localDateKey: 1 }, { unique: true });
export const GameDailyUsage = model('GameDailyUsage', gameDailyUsageSchema, 'game_daily_usage');

const gameAttemptSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    classSectionId: { type: Schema.Types.ObjectId, ref: 'ClassSection' },
    localDateKey: { type: String, required: true },
    seq: { type: Number, required: true },
    score: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    durationSec: Number,
    outcome: { type: String, enum: GAME_OUTCOMES, default: 'in_progress' },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
  },
  opts,
);
gameAttemptSchema.index({ studentId: 1, gameId: 1, localDateKey: 1 });
gameAttemptSchema.index({ schoolId: 1, createdAt: -1 });
export const GameAttempt = model('GameAttempt', gameAttemptSchema, 'game_attempts');

// ------------------------------------------------------------------ certificates
const certificateSchema = new Schema(
  {
    certificateNumber: { type: String, required: true },
    verificationCode: { type: String, required: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    certificationLevelId: { type: Schema.Types.ObjectId, ref: 'CertificationLevel', required: true },
    level: { type: Number, required: true },
    levelTitle: String,
    attemptId: { type: Schema.Types.ObjectId, ref: 'AssessmentAttempt' },
    percent: Number,
    studentDisplayName: { type: String, required: true },
    schoolName: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
  },
  opts,
);
certificateSchema.index({ certificateNumber: 1 }, { unique: true });
certificateSchema.index({ verificationCode: 1 }, { unique: true });
certificateSchema.index({ studentId: 1, certificationLevelId: 1 }, { unique: true });
certificateSchema.index({ schoolId: 1, issuedAt: -1 });
export const Certificate = model('Certificate', certificateSchema, 'certificates');

/** Monotonic counters (certificate numbering). */
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = model('Counter', counterSchema, 'counters');

// ------------------------------------------------------------------ notifications
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'School' },
    type: { type: String, default: 'info' },
    title: { type: String, required: true },
    body: String,
    link: String,
    readAt: Date,
  },
  opts,
);
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema, 'notifications');

// ------------------------------------------------------------------ audit log
const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: Schema.Types.ObjectId,
    schoolId: { type: Schema.Types.ObjectId, ref: 'School' },
    summary: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });
auditSchema.index({ schoolId: 1, createdAt: -1 });
auditSchema.index({ entityType: 1, entityId: 1 });
export const AuditLog = model('AuditLog', auditSchema, 'audit_logs');
