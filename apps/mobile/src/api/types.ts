/** Response shapes of the endpoints the mobile app uses (see apps/api/src/routes). */
import type { ActivityType, Paginated } from '@mango/shared';

export type { Paginated };
export type ID = string;

export interface SubjectRef {
  _id: ID;
  name: string;
  code: string;
  icon?: string;
}

export interface Performance {
  averagePercent: number | null;
  quizAccuracyPercent: number | null;
  sampleSize: number;
}
export interface SubjectPerformance extends Performance {
  subjectId: ID;
  code: string;
  name: string;
}
export interface ActivityCompletionStat {
  expected: number;
  completed: number;
  ratePercent: number | null;
}

// ------------------------------------------------------------------ teacher
export interface TeacherClass {
  sectionId: ID;
  label: string;
  levelNumber: number;
  sectionName: string;
  academicYear: string;
  locked: boolean;
  subjects: SubjectRef[];
}
export interface TeacherHomeClass extends TeacherClass {
  studentCount: number;
  averagePercent: number | null;
  sampleSize: number;
}
export interface TeacherHome {
  teacher: { name: string; schoolName: string };
  totals: { classes: number; students: number; pendingReviews: number; activeActivities: number };
  classes: TeacherHomeClass[];
  upcoming: Array<{ _id: ID; type: ActivityType; title: string; dueAt: string; classSectionId: ID }>;
}
export interface ClassStudentRow {
  id: ID;
  name: string;
  displayName?: string;
  studentCode: string;
  averagePercent: number | null;
  attempts: number;
  certificationLevel: number;
  lastLoginAt?: string;
}
export interface TeacherStudentDetail {
  profile: {
    _id: ID;
    userId: { _id: ID; name: string; lastLoginAt?: string };
    studentCode: string;
    displayName?: string;
    levelNumber: number;
    avatar?: string;
  };
  performance: Performance;
  subjects: SubjectPerformance[];
  recentAttempts: Array<{
    _id: ID;
    quizId?: { _id: ID; title: string } | null;
    subjectId?: { _id: ID; name: string } | null;
    context: string;
    score: number;
    maxScore: number;
    percent: number;
    submittedAt: string;
  }>;
  learningHistory: Array<{
    _id: ID;
    learningItemId?: { _id: ID; title: string; type: string } | null;
    subjectId?: { _id: ID; name: string } | null;
    status: string;
    progressPct: number;
    lastOpenedAt?: string;
    completedAt?: string;
  }>;
  certificates: Certificate[];
  programmes: Array<{ _id: ID; programmeId?: { _id: ID; name: string; code: string; premium: boolean } | null; progressPct?: number; completedAt?: string }>;
  activityCompletion: ActivityCompletionStat;
}

export type ActivityStatus = 'draft' | 'published' | 'closed';
export interface TeacherActivity {
  _id: ID;
  type: ActivityType;
  title: string;
  instructions?: string;
  status: ActivityStatus;
  startAt: string;
  dueAt: string;
  worksheetRef?: string;
  quizId?: ID | { _id: ID; title: string; version?: number } | null;
  subjectId: { _id: ID; name: string; code: string } | ID;
  classSectionId: { _id: ID; levelNumber: number; sectionName: string } | ID;
  studentIds?: ID[];
  completedCount?: number;
  recipientCount?: number;
}
export interface ActivityInput {
  classSectionId: ID;
  studentIds: ID[];
  subjectId: ID;
  type: ActivityType;
  title: string;
  instructions?: string;
  quizId?: ID;
  worksheetRef?: string;
  startAt: string;
  dueAt: string;
  publish: boolean;
}
export interface ActivityResults {
  activity: TeacherActivity;
  summary: { recipients: number; completed: number; completionPercent: number | null; averagePercent: number | null };
  students: Array<{
    studentId: ID;
    name: string;
    studentCode: string;
    completed: boolean;
    completedAt: string | null;
    late: boolean;
    score: number | null;
    maxScore: number | null;
    percent: number | null;
    note: string | null;
    reviewedAt: string | null;
    teacherFeedback: string | null;
  }>;
  questionReview: Array<{ questionId: ID; prompt: string; correctIndex: number; options: string[]; wrongCount: number; answered: number }>;
}
export interface QuizListItem {
  _id: ID;
  title: string;
  context: string;
  subjectId?: { _id: ID; name: string; code: string } | null;
  questionCount: number;
  version: number;
  schoolId?: ID | null;
}
export interface TeacherPerformance {
  period: { from: string | null; to: string | null };
  summary: Performance;
  activityCompletion: ActivityCompletionStat;
  subjects: SubjectPerformance[];
  trend: Array<{ week: string; averagePercent: number; attempts: number }>;
}
export interface InsightStudent {
  studentId: ID;
  name: string;
  class: string;
  averagePercent: number | null;
  attempts: number;
}
export interface TeacherInsights {
  window: string;
  rule: string;
  topPerformers: InsightStudent[];
  needsSupport: InsightStudent[];
}
export interface Subject {
  _id: ID;
  name: string;
  code: string;
  icon?: string;
}

// ------------------------------------------------------------------ student
export interface StudentHome {
  student: { name: string; displayName?: string; avatar?: string; studentCode: string; className: string; schoolName: string };
  dailyProgress: { date: string; quizzes: number; learningItems: number; games: number; dailyGoal: number };
  streak: Streak;
  certification: { currentLevel: number; certificates: number };
  pendingActivities: number;
  subjects: Array<{ id: ID; code: string; name: string; icon?: string; totalItems: number; completedItems: number; progressPercent: number }>;
  continueLearning: { id: ID; title: string; type: string; progressPct: number } | null;
}
export interface Streak {
  current: number;
  activeToday: boolean;
  activeDaysInWindow: number;
}
export interface StudentActivity {
  _id: ID;
  type: ActivityType;
  title: string;
  instructions?: string;
  worksheetRef?: string;
  status: ActivityStatus;
  startAt: string;
  dueAt: string;
  subjectId?: { _id: ID; name: string; code: string } | null;
  teacherId?: { _id: ID; name: string } | null;
  quizId?: { _id: ID; title: string; version?: number } | null;
  completed: boolean;
  completedAt: string | null;
  overdue: boolean;
  result: { percent: number; score: number; maxScore: number } | null;
  teacherFeedback: string | null;
}
export interface LearningSubject {
  _id: ID;
  name: string;
  code: string;
  icon?: string;
  totalItems: number;
  completedItems: number;
  progressPercent: number;
}
export interface ItemProgress {
  status: string;
  progressPct: number;
}
export interface LearningItemSummary {
  _id: ID;
  subjectId: SubjectRef;
  classLevels: number[];
  type: string;
  title: string;
  description?: string;
  instructions?: string;
  estimatedMinutes?: number;
  quizId?: ID | null;
  progress: ItemProgress | null;
}
export interface LearningItemDetail extends Omit<LearningItemSummary, 'progress'> {
  body?: string;
  audioUrl?: string;
  imageUrl?: string;
  progress: { status: string; progressPct: number; completedAt?: string } | null;
  quiz: { id: ID; title: string; questionCount: number; version: number } | null;
}

export interface PublicQuiz {
  id: ID;
  title: string;
  description?: string;
  version: number;
  timeLimitSec?: number | null;
  context: string;
  questionCount: number;
  totalMarks: number;
  questions: Array<{ id: ID; prompt: string; options: string[]; marks: number }>;
}
export interface QuizSubmission {
  clientAttemptId: string;
  quizVersion: number;
  answers: Array<{ questionId: ID; selectedIndex: number }>;
  durationSec: number;
  activityId?: ID;
}
export interface QuizResult {
  attemptId: ID;
  score: number;
  maxScore: number;
  percent: number;
  correctCount: number;
  questionCount: number;
  review?: Array<{
    questionId: ID;
    prompt: string;
    options: string[];
    selectedIndex: number;
    correctIndex: number;
    correct: boolean;
    explanation?: string | null;
  }>;
  // certification only
  passPercent?: number;
  passed?: boolean;
  certificate?: Certificate | null;
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
export interface GameSummary {
  _id: ID;
  code: string;
  name: string;
  description?: string;
  subjectCode?: string;
  dailyLimit: number;
  dailyUsage?: DailyUsage;
  progress: { bestScore: number; bestLevel: number; completedPlays: number };
}
export interface GameStart {
  attemptId: ID;
  seq: number;
  config: GameConfig;
  dailyUsage: DailyUsage;
}
export type GameOutcome = 'completed' | 'failed' | 'abandoned';

export interface NewsCategoryRow {
  code: string;
  name: string;
  articleCount: number;
}
export interface NewsArticle {
  _id: ID;
  category: string;
  title: string;
  summary: string;
  body?: string;
  imageUrl?: string;
  sourceName?: string;
  sourceUrl?: string;
  featured?: boolean;
  publishAt?: string;
  quizId?: ID | null;
}
export interface NewsArticleDetail extends NewsArticle {
  quiz: { id: ID; title: string; questionCount: number; version: number } | null;
}

export interface ProgrammeCard {
  id: ID;
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
export interface ProgrammesResponse {
  premiumAcademies: ProgrammeCard[];
  otherProgrammes: ProgrammeCard[];
}
export interface ProgrammeItem {
  _id: ID;
  title: string;
  type: 'lesson' | 'activity' | 'quiz' | 'experiment';
  content?: string;
  quizId?: ID | null;
  required?: boolean;
  completed: boolean;
}
export interface ProgrammeDetail {
  _id: ID;
  code: string;
  name: string;
  description?: string;
  premium: boolean;
  modules: Array<{ _id: ID; title: string; description?: string; order?: number; items: ProgrammeItem[] }>;
  enrolment: { _id: ID; progressPct?: number; completedAt?: string; completedItemIds?: ID[] } | null;
}

export interface Certificate {
  _id: ID;
  certificateNumber: string;
  level: number;
  levelTitle?: string;
  studentDisplayName?: string;
  schoolName?: string;
  issuedAt: string;
  verificationCode?: string;
  verificationUrl?: string;
  percent?: number;
}
export interface CertificationLevelRow {
  id: ID;
  level: number;
  title: string;
  description?: string;
  passPercent: number;
  prerequisiteLevel?: number | null;
  state: 'certified' | 'available' | 'locked';
  lockReason: string | null;
  bestPercent: number | null;
  attempts: number;
  certificate: { id: ID; certificateNumber: string; issuedAt: string } | null;
}
export interface CertificationLevels {
  currentLevel: number;
  levels: CertificationLevelRow[];
}
export interface CertAssessment {
  level: { id: ID; level: number; title: string; passPercent: number };
  quiz: PublicQuiz;
}

export type ProgressRange = '7d' | '30d' | '90d' | 'all';
export interface StudentProgress {
  range: ProgressRange;
  rangeLabel: string;
  overall: Performance & { completedActivities: number; learningItemsCompleted: number };
  activityCompletion: ActivityCompletionStat;
  subjects: SubjectPerformance[];
  history: Array<{
    _id: ID;
    quizId?: { _id: ID; title: string } | null;
    subjectId?: { _id: ID; name: string } | null;
    context: string;
    percent: number;
    score: number;
    maxScore: number;
    submittedAt: string;
  }>;
  streak: Streak;
  programmes: Array<{ id: ID; code: string; name: string; premium: boolean; locked: boolean; progressPercent: number; enrolled: boolean }>;
  certification: { currentLevel: number; certificates: Certificate[] };
  badges: Array<{ code: string; name: string; description: string; earned: true }>;
  lockedBadges: Array<{ code: string; name: string; description: string }>;
}
export interface StudentProfile {
  name: string;
  displayName?: string;
  avatar?: string;
  studentCode: string;
  levelNumber: number;
  section?: string;
  schoolName: string;
}
