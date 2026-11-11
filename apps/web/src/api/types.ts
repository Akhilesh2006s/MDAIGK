/** Response shapes used by the admin web app (mirrors apps/api route handlers). */
import type { ContentStatus, EntityStatus, Paginated } from '@mango/shared';

export type { Paginated };
export type Id = string;

export interface ContactPerson {
  name?: string;
  email?: string;
  phone?: string;
}

export interface PlanSummary {
  name: string | null;
  status: string;
  startDate: string;
  endDate: string;
}

export interface School {
  _id: Id;
  schoolCode: string;
  name: string;
  address?: string;
  city?: string;
  region?: string;
  contactPerson?: ContactPerson;
  status: EntityStatus;
  timezone?: string;
  currentAcademicYear?: string;
  settings?: { displayName?: string; logoUrl?: string; allowStudentLeaderboard?: boolean };
  createdAt?: string;
  studentCount: number;
  teacherCount: number;
  enabledClasses: number[];
  plan: PlanSummary | null;
}

export interface ClassAccessRow {
  levelNumber: number;
  displayName: string;
  enabled: boolean;
  grantedAt?: string;
}

export interface ProgrammeEntitlement {
  programmeId: Id;
  code: string;
  name: string;
  premium: boolean;
  enabled: boolean;
  validFrom: string | null;
  validUntil: string | null;
  effective: { enabled: boolean; reason?: string };
}

export interface Plan {
  _id: Id;
  name: string;
  description?: string;
  maxClassLevel: number;
  programmeCodes: string[];
  status: 'draft' | 'active' | 'archived';
  activeSchools?: number;
}

export interface Subscription {
  _id: Id;
  planId: Plan | null;
  startDate: string;
  endDate: string;
  status: string;
  createdAt?: string;
}

export interface SchoolAdminRow {
  membershipId: Id;
  status: EntityStatus;
  user: { _id: Id; name: string; email?: string; phone?: string; status?: string; lastLoginAt?: string } | null;
}

export interface SubjectRef {
  _id: Id;
  code: string;
  name: string;
}

export interface Section {
  _id: Id;
  levelNumber: number;
  sectionName: string;
  academicYear: string;
  status: EntityStatus;
  label: string;
  locked: boolean;
  studentCount: number;
  teachers: Array<{ teacher: { _id: Id; name: string } | null; subjects: SubjectRef[] }>;
}

export interface Teacher {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  membershipStatus?: EntityStatus;
  lastLoginAt?: string;
  assignments: Array<{ section: { _id: Id; levelNumber: number; sectionName: string } | null; subjects: SubjectRef[] }>;
}

export interface StudentRow {
  id: Id;
  profileId: Id;
  name: string;
  displayName?: string;
  studentCode: string;
  levelNumber: number;
  section: { _id: Id; levelNumber: number; sectionName: string } | null;
  status: EntityStatus;
  lastLoginAt?: string;
  averagePercent: number | null;
  attempts: number;
}

export interface Performance {
  averagePercent: number | null;
  quizAccuracyPercent: number | null;
  sampleSize: number;
}

export interface SubjectPerf extends Performance {
  subjectId: Id;
  code: string;
  name: string;
}

export interface SectionPerf {
  sectionId: Id;
  label: string;
  levelNumber: number;
  sectionName: string;
  students: number;
  averagePercent: number | null;
  sampleSize: number;
}

export interface ProgrammeParticipation {
  programmeId: Id;
  code: string;
  name: string;
  premium: boolean;
  enrolled: number;
  completed: number;
  averageProgressPercent: number | null;
}

export interface ActivityCompletion {
  expected: number;
  completed: number;
  ratePercent: number | null;
}

export interface Certificate {
  _id: Id;
  certificateNumber: string;
  level: number;
  levelTitle: string;
  percent?: number;
  studentDisplayName: string;
  issuedAt: string;
}

export interface SchoolOverview {
  period: { from: string | null; to: string | null; label: string };
  counts: { students: number; teachers: number; activeSections: number; enabledClasses: number[]; certificatesIssued: number };
  performance: Performance;
  activityCompletion: ActivityCompletion;
  games: { attempts: number; completionPercent: number | null };
  programmes: ProgrammeParticipation[];
  subjects: SubjectPerf[];
  classes: SectionPerf[];
  recentCertificates: Certificate[];
}

export interface StudentDetail {
  profile: {
    _id: Id;
    studentCode: string;
    displayName?: string;
    levelNumber: number;
    status: EntityStatus;
    classSectionId: { _id: Id; levelNumber: number; sectionName: string } | null;
  };
  user: { _id: Id; name: string; status: string; lastLoginAt?: string; createdAt?: string } | null;
  performance: Performance;
  subjects: SubjectPerf[];
  certificates: Certificate[];
  programmes: Array<{ _id: Id; programmeId: { _id: Id; name: string; code: string; premium: boolean } | null; progressPct?: number; completedAt?: string | null; startedAt?: string }>;
  activityCompletion: ActivityCompletion;
  recentAttempts: Array<{ _id: Id; quizId: { _id: Id; title: string } | null; percent: number; score: number; maxScore: number; context: string; submittedAt: string }>;
}

export interface MonthlyCount {
  month: string;
  added: number;
  cumulative: number;
}

export interface PlatformAnalytics {
  period: { label: string; generatedAt: string };
  totals: {
    schools: number;
    activeSchools: number;
    students: number;
    teachers: number;
    enabledClasses: number;
    premiumSchools: number;
    programmeEnrolments: number;
    averagePerformancePercent: number | null;
    performanceSampleSize: number;
    classLevelsAvailable: number;
  };
  growth: { schools: MonthlyCount[]; students: MonthlyCount[]; teachers: MonthlyCount[] };
  subjects: SubjectPerf[];
  programmes: ProgrammeParticipation[];
  activity: Array<{ date: string; quizAttempts: number; gameAttempts: number }>;
  recentSchools: Array<{ id: Id; name: string; schoolCode: string; location: string; students: number; plan: string | null; planStatus: string | null; status: EntityStatus }>;
}

export interface PlatformUser {
  id: Id;
  name: string;
  email?: string;
  role: string;
  status: EntityStatus;
  lastLoginAt?: string;
  createdAt?: string;
  schools: Array<{ school: { _id: Id; name: string; schoolCode: string } | null; status: string }>;
}

export interface Subject {
  _id: Id;
  code: string;
  name: string;
  description?: string;
  icon?: string;
  enabled: boolean;
  displayOrder?: number;
  classLevels: number[];
}

export interface LearningItem {
  _id: Id;
  subjectId: SubjectRef | null;
  classLevels: number[];
  type: string;
  title: string;
  description?: string;
  body?: string;
  instructions?: string;
  audioUrl?: string;
  imageUrl?: string;
  estimatedMinutes?: number;
  quizId?: Id | null;
  status: ContentStatus;
  version?: number;
  updatedAt?: string;
}

export interface NewsArticle {
  _id: Id;
  category: string;
  title: string;
  summary: string;
  body?: string;
  imageUrl?: string;
  sourceName?: string;
  sourceUrl?: string;
  targetClasses: number[];
  featured?: boolean;
  status: ContentStatus;
  publishAt?: string;
  archiveAt?: string | null;
  quizId?: Id | null;
  updatedAt?: string;
}

export interface QuizQuestion {
  _id?: Id;
  prompt: string;
  options: string[];
  correctIndex: number;
  marks: number;
  explanation?: string;
}

export interface Quiz {
  _id: Id;
  title: string;
  description?: string;
  context: 'learning' | 'news' | 'activity' | 'certification' | 'programme';
  subjectId?: SubjectRef | null;
  classLevels?: number[];
  timeLimitSec?: number;
  revealPolicy?: 'after_submit' | 'never';
  status: ContentStatus;
  version?: number;
  questions?: QuizQuestion[];
  questionCount?: number;
  updatedAt?: string;
}

export interface Game {
  _id: Id;
  code: string;
  name: string;
  description?: string;
  subjectCode?: string;
  enabled: boolean;
  classLevels: number[];
  dailyLimit: number;
}

export interface ProgrammeItem {
  _id?: Id;
  title: string;
  type: 'lesson' | 'activity' | 'quiz' | 'experiment';
  content?: string;
  quizId?: Id | null;
  required: boolean;
}

export interface ProgrammeModule {
  _id?: Id;
  title: string;
  description?: string;
  order: number;
  items: ProgrammeItem[];
}

export interface Programme {
  _id: Id;
  code: string;
  name: string;
  description?: string;
  premium: boolean;
  classLevels?: number[];
  status: ContentStatus;
  displayOrder?: number;
  modules: ProgrammeModule[];
  enabledSchools?: number;
  enrolments?: number;
}

export interface CertificationLevel {
  _id: Id;
  level: number;
  title: string;
  description?: string;
  eligibleClassLevels?: number[];
  prerequisiteLevel?: number | null;
  quizId?: { _id: Id; title: string; version?: number } | null;
  passPercent?: number;
  maxAttemptsPerDay?: number;
  status: ContentStatus;
}

export interface AuditEntry {
  _id: Id;
  action: string;
  entityType?: string;
  entityId?: Id;
  summary?: string;
  actorId?: { _id: Id; name: string; email?: string } | null;
  schoolId?: { _id: Id; name: string } | null;
  createdAt: string;
  before?: unknown;
  after?: unknown;
}

export interface PlatformSettings {
  platformName?: string;
  supportEmail?: string;
  defaultTimezone?: string;
  defaultAcademicYear?: string;
  studentPinMinLength?: number;
  maintenanceMode?: boolean;
  updatedAt?: string;
}

export interface Notification {
  _id: Id;
  title: string;
  body?: string;
  type?: string;
  readAt?: string | null;
  createdAt: string;
}

export interface SearchResults {
  schools: Array<{ _id: Id; name: string; schoolCode: string; city?: string; status: string }>;
  users: Array<{ _id: Id; name: string; email?: string; role: string; status: string }>;
  students: Array<{ _id: Id; studentCode: string; levelNumber: number; status: string; userId: { _id: Id; name: string } | null; schoolId: { _id: Id; name: string } | null }>;
  sections: Array<{ _id: Id; levelNumber: number; sectionName: string; academicYear: string; schoolId: { _id: Id; name: string } | null }>;
}

export type ReportType = 'class' | 'subject' | 'games' | 'certificates' | 'programmes' | 'students';
export interface ReportResponse {
  type: ReportType;
  period: { from: string | null; to: string | null };
  rows: Array<Record<string, string | number | null>>;
}
