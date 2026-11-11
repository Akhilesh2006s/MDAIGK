import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { CLASS_LEVELS, CONTENT_STATUS, DEFAULT_GAME_DAILY_LIMIT, LEARNING_ITEM_TYPES, NEWS_CATEGORY_CODES } from '@mango/shared';

const opts = { timestamps: true } as const;
const LEVELS: number[] = [...CLASS_LEVELS];
const classLevels = { type: [{ type: Number, enum: LEVELS }], default: () => [...LEVELS] };

// ------------------------------------------------------------------ subjects
const subjectSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: String,
    icon: String,
    enabled: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    classLevels,
  },
  opts,
);
subjectSchema.index({ code: 1 }, { unique: true });
export const Subject = model('Subject', subjectSchema, 'subjects');

// ------------------------------------------------------------------ quizzes (questions embedded: bounded list)
const questionSchema = new Schema({
  prompt: { type: String, required: true, maxlength: 1000 },
  options: { type: [String], validate: [(v: string[]) => v.length >= 2 && v.length <= 6, '2-6 options required'] },
  correctIndex: { type: Number, required: true, min: 0 },
  marks: { type: Number, default: 1, min: 0 },
  explanation: { type: String, maxlength: 1000 },
});

const quizSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: String,
    context: { type: String, enum: ['learning', 'news', 'activity', 'certification', 'programme'], required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    classLevels,
    timeLimitSec: Number,
    /** when correct answers are revealed to students */
    revealPolicy: { type: String, enum: ['after_submit', 'never'], default: 'after_submit' },
    version: { type: Number, default: 1 },
    status: { type: String, enum: CONTENT_STATUS, default: 'draft' },
    questions: [questionSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** set for teacher-authored activity quizzes so they stay school-scoped */
    schoolId: { type: Schema.Types.ObjectId, ref: 'School' },
  },
  opts,
);
quizSchema.index({ context: 1, status: 1 });
quizSchema.index({ subjectId: 1, status: 1 });
quizSchema.index({ schoolId: 1, createdBy: 1 });
export type QuizDoc = InferSchemaType<typeof quizSchema> & { _id: Types.ObjectId };
export const Quiz = model('Quiz', quizSchema, 'quizzes');

/** Immutable snapshot of every quiz version so attempts are scored against the version actually taken. */
const quizVersionSchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    version: { type: Number, required: true },
    questions: [questionSchema],
  },
  opts,
);
quizVersionSchema.index({ quizId: 1, version: 1 }, { unique: true });
export const QuizVersion = model('QuizVersion', quizVersionSchema, 'questions');

// ------------------------------------------------------------------ learning items
const learningItemSchema = new Schema(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    classLevels,
    type: { type: String, enum: LEARNING_ITEM_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    body: { type: String, maxlength: 20000 },
    instructions: { type: String, maxlength: 2000 },
    audioUrl: String,
    imageUrl: String,
    estimatedMinutes: { type: Number, default: 10 },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
    status: { type: String, enum: CONTENT_STATUS, default: 'draft' },
    version: { type: Number, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    publishedAt: Date,
  },
  opts,
);
learningItemSchema.index({ subjectId: 1, status: 1, classLevels: 1 });
learningItemSchema.index({ title: 'text', description: 'text' });
export const LearningItem = model('LearningItem', learningItemSchema, 'learning_items');

const learningProgressSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    learningItemId: { type: Schema.Types.ObjectId, ref: 'LearningItem', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    progressPct: { type: Number, min: 0, max: 100, default: 0 },
    lastOpenedAt: Date,
    completedAt: Date,
  },
  opts,
);
learningProgressSchema.index({ studentId: 1, learningItemId: 1 }, { unique: true });
learningProgressSchema.index({ studentId: 1, status: 1, lastOpenedAt: -1 });
export const LearningProgress = model('LearningProgress', learningProgressSchema, 'learning_progress');

// ------------------------------------------------------------------ news
const newsSchema = new Schema(
  {
    category: { type: String, enum: NEWS_CATEGORY_CODES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, required: true, maxlength: 600 },
    body: { type: String, maxlength: 20000 },
    imageUrl: String,
    sourceName: String,
    sourceUrl: String,
    targetClasses: classLevels,
    featured: { type: Boolean, default: false },
    status: { type: String, enum: CONTENT_STATUS, default: 'draft' },
    publishAt: Date,
    archiveAt: Date,
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  opts,
);
newsSchema.index({ status: 1, publishAt: -1 });
newsSchema.index({ category: 1, status: 1, publishAt: -1 });
export const NewsArticle = model('NewsArticle', newsSchema, 'news_articles');

// ------------------------------------------------------------------ games
const gameSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true },
    name: { type: String, required: true },
    description: String,
    subjectCode: String,
    classLevels,
    enabled: { type: Boolean, default: true },
    dailyLimit: { type: Number, default: DEFAULT_GAME_DAILY_LIMIT, min: 1, max: 20 },
    /** free-form game configuration (word lists, time limits...) */
    config: { type: Schema.Types.Mixed, default: {} },
  },
  opts,
);
gameSchema.index({ code: 1 }, { unique: true });
export const Game = model('Game', gameSchema, 'games');

// ------------------------------------------------------------------ programmes
const programmeItemSchema = new Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['lesson', 'activity', 'quiz', 'experiment'], default: 'lesson' },
  content: { type: String, maxlength: 20000 },
  quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
  required: { type: Boolean, default: true },
});
const programmeModuleSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  order: { type: Number, default: 0 },
  items: [programmeItemSchema],
});
const programmeSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true },
    name: { type: String, required: true },
    description: String,
    premium: { type: Boolean, default: false },
    classLevels,
    modules: [programmeModuleSchema],
    status: { type: String, enum: CONTENT_STATUS, default: 'published' },
    displayOrder: { type: Number, default: 0 },
  },
  opts,
);
programmeSchema.index({ code: 1 }, { unique: true });
export type ProgrammeDoc = InferSchemaType<typeof programmeSchema> & { _id: Types.ObjectId };
export const Programme = model('Programme', programmeSchema, 'programmes');

const programmeEntitlementSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    programmeId: { type: Schema.Types.ObjectId, ref: 'Programme', required: true },
    enabled: { type: Boolean, default: false },
    validFrom: Date,
    validUntil: Date,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  opts,
);
programmeEntitlementSchema.index({ schoolId: 1, programmeId: 1 }, { unique: true });
export const SchoolProgrammeEntitlement = model('SchoolProgrammeEntitlement', programmeEntitlementSchema, 'school_programme_entitlements');

const enrolmentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    programmeId: { type: Schema.Types.ObjectId, ref: 'Programme', required: true },
    completedItemIds: [{ type: Schema.Types.ObjectId }],
    progressPct: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: Date,
    completedAt: Date,
  },
  opts,
);
enrolmentSchema.index({ studentId: 1, programmeId: 1 }, { unique: true });
enrolmentSchema.index({ schoolId: 1, programmeId: 1 });
export const ProgrammeEnrolment = model('ProgrammeEnrolment', enrolmentSchema, 'programme_enrolments');

// ------------------------------------------------------------------ certification levels
const certLevelSchema = new Schema(
  {
    level: { type: Number, min: 1, max: 10, required: true },
    title: { type: String, required: true },
    description: String,
    eligibleClassLevels: classLevels,
    prerequisiteLevel: { type: Number, min: 1, max: 10 },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
    passPercent: { type: Number, min: 1, max: 100, default: 60 },
    maxAttemptsPerDay: { type: Number, default: 3 },
    status: { type: String, enum: CONTENT_STATUS, default: 'published' },
  },
  opts,
);
certLevelSchema.index({ level: 1 }, { unique: true });
export const CertificationLevel = model('CertificationLevel', certLevelSchema, 'certification_levels');

// ------------------------------------------------------------------ platform settings (singleton)
const platformSettingsSchema = new Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    platformName: { type: String, default: 'Mango Dude' },
    supportEmail: String,
    defaultTimezone: { type: String, default: 'Asia/Kolkata' },
    defaultAcademicYear: { type: String, default: '2026-27' },
    studentPinMinLength: { type: Number, default: 4 },
    maintenanceMode: { type: Boolean, default: false },
  },
  opts,
);
export const PlatformSettings = model('PlatformSettings', platformSettingsSchema, 'platform_settings');
