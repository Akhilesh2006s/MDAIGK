/**
 * @mango/shared — constants, design tokens and API contract types shared by
 * the Express API, the React admin web app and the React Native mobile app.
 * Keep this package dependency-free so every client can compile it from source.
 */

// ---------------------------------------------------------------- roles
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];
export const WEB_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN];
export const MOBILE_ROLES: Role[] = [ROLES.TEACHER, ROLES.STUDENT];

// ---------------------------------------------------------------- brand
export const COLORS = {
  forestGreen: '#145C38',
  forestGreenDark: '#0E4529',
  mangoYellow: '#FFC928',
  premiumGold: '#D9A520',
  lightGreen: '#E8F3E8',
  warmIvory: '#FFFDF5',
  text: '#252B25',
  textMuted: '#5F665F',
  white: '#FFFFFF',
  border: '#E4E2D6',
  danger: '#C0392B',
  dangerBg: '#FDECEA',
  info: '#1F6FB2',
  locked: '#9AA09A',
} as const;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADII = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const FONT_SIZES = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 } as const;

// ---------------------------------------------------------------- statuses
export const ENTITY_STATUS = ['active', 'inactive'] as const;
export type EntityStatus = (typeof ENTITY_STATUS)[number];

export const CONTENT_STATUS = ['draft', 'review', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];

export const PLAN_STATUS = ['draft', 'active', 'expired', 'suspended'] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

export const ACTIVITY_STATUS = ['draft', 'published', 'closed'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];

export const ACTIVITY_TYPES = ['quiz', 'practice', 'worksheet'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// ---------------------------------------------------------------- classes
export const CLASS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type ClassLevelNumber = (typeof CLASS_LEVELS)[number];
export const classLabel = (n: number) => `Class ${n}`;

// ---------------------------------------------------------------- subjects
export const SUBJECTS = [
  { code: 'ENG', name: 'English', icon: 'book-open', scope: 'New words, vocabulary, audio stories, spelling, grammar and quizzes.' },
  { code: 'MATH', name: 'Mathematics', icon: 'calculator', scope: 'Concepts, mental mathematics, timed calculations, puzzles and challenges.' },
  { code: 'SCI', name: 'Science', icon: 'flask', scope: 'Concepts, discoveries, experiments, observation activities and quizzes.' },
  { code: 'AICS', name: 'AI & Computer Studies', icon: 'cpu', scope: 'Computer fundamentals, AI basics, digital literacy and computational thinking.' },
  { code: 'SPORTS', name: 'Sports', icon: 'trophy', scope: 'Sports facts, rules, famous athletes and quizzes.' },
  { code: 'SST', name: 'Social Studies', icon: 'globe', scope: 'Indian history, geography, civics, culture and heritage.' },
] as const;
export type SubjectCode = (typeof SUBJECTS)[number]['code'];

export const LEARNING_ITEM_TYPES = ['concept', 'vocabulary', 'story', 'practice', 'experiment', 'puzzle', 'reading'] as const;
export type LearningItemType = (typeof LEARNING_ITEM_TYPES)[number];

// ---------------------------------------------------------------- news
export const NEWS_CATEGORIES = [
  { code: 'NATIONAL', name: 'National News' },
  { code: 'INTERNATIONAL', name: 'International News' },
  { code: 'SCIENCE_SPACE', name: 'Science & Space' },
  { code: 'TECH_AI', name: 'Technology & AI' },
  { code: 'SPORTS_ENT', name: 'Sports & Entertainment' },
  { code: 'ENVIRONMENT', name: 'Environment & Climate' },
  { code: 'BUSINESS', name: 'Business & Economy' },
  { code: 'HEALTH_SOCIETY', name: 'Health & Society' },
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]['code'];
export const NEWS_CATEGORY_CODES = NEWS_CATEGORIES.map((c) => c.code) as NewsCategory[];

// ---------------------------------------------------------------- games
export const GAMES = [
  { code: 'SPELL_MASTER', name: 'Spell Master', subjectCode: 'ENG', description: 'Word spelling rounds with feedback and level progression.' },
  { code: 'GRAMMAR_FIXES', name: 'Grammar Fixes', subjectCode: 'ENG', description: 'Sentence correction and grammar selection challenges.' },
  { code: 'G2048', name: '2048', subjectCode: 'MATH', description: 'Lightweight number-combination puzzle.' },
  { code: 'MATH_SPRINT', name: 'Math Sprint', subjectCode: 'MATH', description: 'Timed mental arithmetic challenges.' },
] as const;
export type GameCode = (typeof GAMES)[number]['code'];
/** Default daily cap per student per game (configurable per game). */
export const DEFAULT_GAME_DAILY_LIMIT = 2;
export const GAME_OUTCOMES = ['in_progress', 'completed', 'failed', 'abandoned'] as const;
export type GameOutcome = (typeof GAME_OUTCOMES)[number];

// ---------------------------------------------------------------- programmes
export const PROGRAMMES = [
  { code: 'AI_ACADEMY', name: 'AI Academy', premium: true, description: 'Learn AI, technology concepts and future skills.' },
  { code: 'HEALTH_ACADEMY', name: 'Health Academy', premium: true, description: 'Health, fitness, wellbeing and healthy habits.' },
  { code: 'YOUNG_ENTREPRENEUR', name: 'Young Entrepreneur Programme', premium: true, description: 'Business awareness, leadership and problem-solving.' },
  { code: 'CHESS_ACADEMY', name: 'Chess Academy', premium: true, description: 'Chess rules, strategy, tactics and critical thinking.' },
  { code: 'YOUNG_SCIENTIST', name: 'Young Scientist Programme', premium: false, description: 'Separate enrichment programme for experiments, discoveries and observation.' },
] as const;
export type ProgrammeCode = (typeof PROGRAMMES)[number]['code'];
export const PREMIUM_ACADEMY_CODES = PROGRAMMES.filter((p) => p.premium).map((p) => p.code);

// ---------------------------------------------------------------- certification
export const CERTIFICATION_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// ---------------------------------------------------------------- errors
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  SCHOOL_CONTEXT_REQUIRED: 'SCHOOL_CONTEXT_REQUIRED',
  SCHOOL_INACTIVE: 'SCHOOL_INACTIVE',
  CLASS_LOCKED: 'CLASS_LOCKED',
  PROGRAMME_LOCKED: 'PROGRAMME_LOCKED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_SUBMISSION: 'DUPLICATE_SUBMISSION',
  QUIZ_VERSION_MISMATCH: 'QUIZ_VERSION_MISMATCH',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',
  PREREQUISITE_NOT_MET: 'PREREQUISITE_NOT_MET',
  ALREADY_CERTIFIED: 'ALREADY_CERTIFIED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ---------------------------------------------------------------- API contract
export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  role: Role;
  status: EntityStatus;
  schools: Array<{ schoolId: string; schoolName: string; schoolCode: string; role: Role }>;
  student?: { studentProfileId: string; studentCode: string; classSectionId: string; levelNumber: number; sectionName: string };
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** Header the clients send to choose the active school when a user belongs to several. */
export const SCHOOL_HEADER = 'x-school-id';
