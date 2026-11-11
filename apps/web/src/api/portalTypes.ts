/** Response shapes for the Teacher and Student portals (mirrors apps/api routes). */

export interface SubjectRef {
  _id: string;
  name: string;
  code: string;
  icon?: string;
}

export interface Completion {
  expected: number;
  completed: number;
  ratePercent: number | null;
}

export interface SubjectScore {
  subjectId: string;
  code?: string;
  name: string;
  averagePercent: number | null;
  quizAccuracyPercent?: number | null;
  sampleSize: number;
}

// ------------------------------------------------------------------ teacher
export interface TeacherClass {
  sectionId: string;
  label: string;
  levelNumber: number;
  sectionName: string;
  academicYear?: string;
  locked: boolean;
  subjects: SubjectRef[];
  studentCount?: number;
  averagePercent?: number | null;
  sampleSize?: number;
}

export interface TeacherHome {
  teacher: { name: string; schoolName: string };
  totals: { classes: number; students: number; pendingReviews: number; activeActivities: number };
  classes: TeacherClass[];
  upcoming: Array<{ _id: string; type: ActivityType; title: string; dueAt: string; classSectionId: string }>;
}

export interface ClassStudent {
  id: string;
  name: string;
  displayName?: string;
  studentCode: string;
  averagePercent: number | null;
  attempts: number;
  certificationLevel?: number;
  lastLoginAt?: string | null;
}

export type ActivityType = 'quiz' | 'practice' | 'worksheet';
export type ActivityStatus = 'draft' | 'published' | 'closed';

export interface TeacherActivity {
  _id: string;
  classSectionId: { _id: string; levelNumber: number; sectionName: string } | string;
  studentIds: string[];
  subjectId: { _id: string; name: string; code: string } | string;
  type: ActivityType;
  title: string;
  instructions?: string;
  quizId?: { _id: string; title: string; version?: number } | string | null;
  learningItemId?: string | null;
  worksheetRef?: string;
  startAt: string;
  dueAt: string;
  status: ActivityStatus;
  publishedAt?: string;
  completedCount?: number;
  recipientCount?: number;
}

export interface ActivityResults {
  activity: TeacherActivity;
  summary: { recipients: number; completed: number; completionPercent: number | null; averagePercent: number | null };
  students: Array<{
    studentId: string;
    name: string;
    studentCode: string;
    completed: boolean;
    completedAt: string | null;
    late: boolean;
    score: number | null;
    maxScore: number | null;
    percent: number | null;
    note?: string | null;
    reviewedAt?: string | null;
    teacherFeedback?: string | null;
  }>;
  questionReview: Array<{ questionId: string; prompt: string; correctIndex: number; options: string[]; wrongCount: number; answered: number }>;
}

export interface TeacherPerformance {
  period: { from?: string | null; to?: string | null };
  summary: { averagePercent: number | null; quizAccuracyPercent: number | null; sampleSize: number };
  activityCompletion?: Completion | null;
  subjects: SubjectScore[];
  trend: Array<{ week: string; averagePercent: number | null; attempts: number }>;
}

export interface InsightRow {
  studentId: string;
  name: string;
  class: string;
  averagePercent: number | null;
  attempts: number;
}

export interface TeacherInsights {
  window: string;
  rule: string;
  topPerformers: InsightRow[];
  needsSupport: InsightRow[];
}

export interface QuizListRow {
  _id: string;
  title: string;
  context: string;
  status: string;
  version: number;
  questionCount?: number;
  subjectId?: { _id: string; name: string } | string | null;
  classLevels?: number[];
  schoolId?: string | null;
}

// ------------------------------------------------------------------ student
export interface StudentHome {
  student: { name: string; displayName?: string; avatar?: string; studentCode: string; className: string; schoolName: string };
  dailyProgress: { date: string; quizzes: number; learningItems: number; games: number; dailyGoal: number };
  streak: Streak;
  certification: { currentLevel: number; certificates: number | unknown[] };
  pendingActivities: number;
  subjects: SubjectProgress[];
  continueLearning: { id: string; title: string; type: string; progressPct: number } | null;
}

export interface Streak {
  current: number;
  activeToday: boolean;
  activeDaysInWindow: number;
}

export interface SubjectProgress {
  id: string;
  code: string;
  name: string;
  icon?: string;
  totalItems: number;
  completedItems: number;
  progressPercent: number | null;
}

export interface StudentActivity {
  _id: string;
  subjectId: { _id: string; name: string; code: string };
  teacherId?: { _id: string; name: string };
  quizId?: { _id: string; title: string; version: number } | null;
  type: ActivityType;
  title: string;
  instructions?: string;
  worksheetRef?: string;
  startAt: string;
  dueAt: string;
  status: ActivityStatus;
  completed: boolean;
  completedAt?: string | null;
  overdue: boolean;
  result: { percent: number; score: number; maxScore: number } | null;
  teacherFeedback?: string | null;
}

export interface LearningItemRow {
  _id: string;
  title: string;
  type: string;
  description?: string;
  estimatedMinutes?: number;
  subjectId: SubjectRef;
  classLevels?: number[];
  progress: { status: string; progressPct: number } | null;
}

export interface LearningItemDetail extends LearningItemRow {
  body?: string;
  instructions?: string;
  audioUrl?: string;
  imageUrl?: string;
  quiz: { id: string; title: string; questionCount: number; version: number } | null;
}

export interface PublicQuestion {
  id: string;
  prompt: string;
  options: string[];
  marks?: number;
}

export interface PublicQuiz {
  id: string;
  title: string;
  description?: string;
  version: number;
  timeLimitSec?: number | null;
  context?: string;
  questionCount: number;
  totalMarks?: number;
  questions: PublicQuestion[];
}

export interface AttemptReview {
  questionId: string;
  prompt: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation?: string;
}

export interface AttemptResult {
  attemptId?: string;
  score: number;
  maxScore: number;
  percent: number;
  correctCount: number;
  questionCount: number;
  review?: AttemptReview[];
  passed?: boolean;
  passPercent?: number;
  certificate?: { _id?: string; id?: string; certificateNumber?: string } | null;
}

export interface AttemptBody {
  clientAttemptId: string;
  quizVersion: number;
  durationSec: number;
  answers: Array<{ questionId: string; selectedIndex: number }>;
}

export interface NewsCategory {
  code: string;
  name: string;
  articleCount: number;
}

export interface NewsRow {
  _id: string;
  title: string;
  summary?: string;
  category: string;
  imageUrl?: string;
  publishedAt?: string;
  classLevels?: number[];
}

export interface NewsDetail extends NewsRow {
  body?: string;
  source?: string;
  quiz: { id: string; title: string; questionCount: number; version: number } | null;
}

export interface DailyUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  dateKey?: string;
}

export interface GameConfig {
  words?: string[];
  rounds?: number;
  sentences?: Array<{ wrong: string; options: string[]; correctIndex: number }>;
  durationSec?: number;
  operations?: string[];
  maxOperand?: number;
  target?: number;
  size?: number;
}

export interface StudentGame {
  _id: string;
  code: string;
  name: string;
  description?: string;
  subjectCode?: string;
  config: GameConfig;
  dailyLimit: number;
  dailyUsage: DailyUsage;
  progress: { bestScore: number | null; bestLevel: number | null; completedPlays: number } | null;
}

export interface StudentProgramme {
  id: string;
  code: string;
  name: string;
  description?: string;
  premium: boolean;
  moduleCount: number;
  locked: boolean;
  lockReason: string | null;
  validUntil: string | null;
  enrolment: { progressPercent: number; completed: boolean } | null;
  action: 'locked' | 'continue' | 'explore';
}

export interface ProgrammeItem {
  _id: string;
  title: string;
  type: 'lesson' | 'activity' | 'quiz' | 'experiment';
  content?: string;
  quizId?: string | null;
  required?: boolean;
  completed: boolean;
}

export interface ProgrammeDetail {
  _id: string;
  code: string;
  name: string;
  description?: string;
  premium: boolean;
  modules: Array<{ _id: string; title: string; description?: string; items: ProgrammeItem[] }>;
  enrolment: { progressPct?: number; completedAt?: string | null; completedItemIds?: string[] } | null;
}

export interface CertLevel {
  id: string;
  level: number;
  title: string;
  description?: string;
  passPercent: number;
  prerequisiteLevel?: number | null;
  state: 'available' | 'locked' | 'passed' | 'not_eligible' | string;
  lockReason: string | null;
  bestPercent: number | null;
  attempts: number;
  certificate: { id: string; certificateNumber: string; issuedAt: string } | null;
}

export interface CertificateRow {
  _id: string;
  level: number;
  levelTitle?: string;
  certificateNumber: string;
  issuedAt: string;
  percent?: number;
}

export interface StudentProgress {
  range: string;
  rangeLabel: string;
  overall: { averagePercent: number | null; quizAccuracyPercent: number | null; sampleSize: number; completedActivities: number; learningItemsCompleted: number };
  activityCompletion?: Completion | null;
  subjects: SubjectScore[];
  history: Array<{ _id: string; quizId?: { title: string } | null; subjectId?: { name: string } | null; percent: number; submittedAt: string; context?: string }>;
  streak: Streak;
  programmes: Array<{ id: string; code: string; name: string; premium: boolean; locked: boolean; progressPercent: number | null; enrolled: boolean }>;
  certification: { currentLevel: number; certificates: number | unknown[] };
  badges: Array<{ code: string; name: string; description: string; earned?: boolean }>;
  lockedBadges: Array<{ code: string; name: string; description: string }>;
}

export interface StudentProfileData {
  name: string;
  displayName?: string;
  avatar?: string;
  studentCode: string;
  levelNumber: number;
  section: string;
  schoolName: string;
}
