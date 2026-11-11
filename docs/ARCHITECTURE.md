# Architecture

```
apps/web     React 19 + Vite + TypeScript   → Super Admin & School Admin (browser only)
apps/mobile  React Native (Expo) + TypeScript → Teacher & Student (Android-first)
apps/api     Node.js + Express 5 + TypeScript → REST API /api/v1, OpenAPI at /api/docs
packages/shared  constants, brand tokens, enums, API types used by all three
MongoDB (Atlas)  only application database (Mongoose ODM)
```

Request flow: client → Express router → `authenticate` (JWT + active account) → role guard (`requireRole`) →
school scope (`resolveMemberSchool` from membership / `x-school-id`, or `schoolParamAccess` for `/schools/:schoolId/*`)
→ zod validation → service (entitlements, scoring, limits, certificates) → MongoDB → JSON
(`{ error: { code, message, details } }` on failure).

Business rules live only in the API, so the web app, mobile app and API can be released independently.

## Source layout (API)

| Path | Purpose |
|---|---|
| `src/config/env.ts` | Validated environment (`MONGO_URI`, JWT secret, CORS, timezone…) |
| `src/db/connect.ts` | Connection, optional `DNS_SERVERS`, `withTransaction` (Atlas replica set) |
| `src/models/identity.ts` | users, refresh_tokens, schools, school_memberships, class_levels, school_class_access, class_sections, teacher_assignments, student_profiles, subscription_plans, school_subscriptions |
| `src/models/content.ts` | subjects, quizzes, questions (immutable quiz versions), learning_items, learning_progress, news_articles, games, programmes, school_programme_entitlements, programme_enrolments, certification_levels, platform_settings |
| `src/models/records.ts` | activities, activity_completions, assessment_attempts, game_daily_usage, game_attempts, certificates, counters, notifications, audit_logs |
| `src/middleware/` | auth/role/school scope, error handler |
| `src/services/` | `access` (class/programme entitlements, teacher scope), `quiz` (versioned scoring), `games` (atomic daily cap), `certificates` (eligibility, issue, PDF), `analytics` (metric definitions), `progress` (streak, badges) |
| `src/routes/` | `auth`, `schools` (SA + School Admin), `platform` (plans, users, search, audit, settings, platform analytics, notifications), `content` (subjects, learning, news, quizzes), `engagement` (games, programmes, certifications, certificates, public verify), `teacher`, `student`, `analytics` |
| `src/scripts/seed.ts` | Reference data + demo schools; `dev-memory.ts` runs API on in-memory MongoDB |
| `tests/` | Jest + Supertest against an in-memory replica set |

## Data model notes

- Every school-scoped document stores `schoolId`; every school-scoped query filters by it.
- Classes 1–10 are fixed (`class_levels`). `school_class_access` is the entitlement source of truth; sections can only be created in enabled classes; all class-specific requests re-check the entitlement.
- Bounded data is embedded (quiz questions, programme modules); high-growth data is referenced (attempts, students, audit events).
- Quiz edits that change questions bump `version`; each version is snapshotted in `questions` (`QuizVersion`) so attempts are scored against the version taken.
- Game daily cap: unique `{studentId, gameId, localDateKey}` counter updated with a conditional upsert — atomic under concurrency (tested with 6 parallel requests → exactly 2 accepted).
- Certificates: unique `{studentId, certificationLevelId}`, unique `certificateNumber` from an atomic counter, unique `verificationCode`.
- Multi-document writes (school creation, subscription assignment, teacher/student creation) run in transactions when the deployment supports them (Atlas does).

### Indexes (from the spec, plus query-driven ones)

| Collection | Index |
|---|---|
| schools | `{schoolCode:1}` unique; `{status:1, createdAt:-1}`; text |
| school_memberships | `{schoolId:1, userId:1}` unique; `{userId:1,status:1}`; `{schoolId:1,role:1,status:1}` |
| student_profiles | `{schoolId:1, studentCode:1}` unique; `{userId:1}` unique; `{schoolId:1, classSectionId:1, status:1}` |
| teacher_assignments | `{teacherId:1, classSectionId:1}` unique; `{schoolId:1, classSectionId:1}` |
| school_class_access | `{schoolId:1, levelNumber:1}` unique |
| class_sections | `{schoolId:1, levelNumber:1, sectionName:1, academicYear:1}` unique |
| assessment_attempts | `{studentId:1, submittedAt:-1}`; `{studentId:1, clientAttemptId:1}` unique; `{schoolId:1, classSectionId:1, submittedAt:-1}`; `{activityId:1, studentId:1}` |
| game_attempts | `{studentId:1, gameId:1, localDateKey:1}`; `{schoolId:1, createdAt:-1}` |
| game_daily_usage | `{studentId:1, gameId:1, localDateKey:1}` unique |
| news_articles | `{status:1, publishAt:-1}`; `{category:1, status:1, publishAt:-1}` |
| certificates | `{certificateNumber:1}` unique; `{verificationCode:1}` unique; `{studentId:1, certificationLevelId:1}` unique |
| refresh_tokens | `{tokenHash:1}` unique; TTL on `expiresAt` |
| audit_logs | `{createdAt:-1}`; `{schoolId:1, createdAt:-1}` |

Indexes are declared on the Mongoose schemas and created by `syncIndexes()` at API start-up and by the seed script.
Before production, confirm hot queries with `explain()` on realistic data.

## Not in scope (per the scope document)

DevOps, hosting, CI/CD, domains/TLS/CDN, media storage, backups, monitoring, third-party SMS/email/push/payment/AI/news
integrations, attendance, video content, admin mobile apps. The code is structured so a separate infrastructure team can
deploy `apps/api` (Node 20+, `npm run build && npm start`), `apps/web` (static `dist/`), and build the mobile app with EAS.
