# Business rules & open decisions

The scope document (§27) lists decisions to freeze before release. The code implements the defaults below; each is a
single, clearly located setting so it can be changed once the client confirms.

| Decision | Implemented default | Where to change |
|---|---|---|
| Admin platform | Super Admin & School Admin are **web only**: `POST /auth/login` with `client: "mobile"` rejects admin roles. | `apps/api/src/routes/auth.ts` → `assertClientRole` |
| Teacher/Student platform | **Phase 1 (client decision, Nov 2026): Teacher and Student use the web app** (`/teacher`, `/student` portals). Phase 2: the React Native (Expo) app in `apps/mobile`, already built against the same API. Set `WEB_ADMIN_ONLY=true` on the API to restrict the web to admins again. | `apps/web`, `apps/mobile` |
| Login method | Admins/teachers: email + password (bcrypt, 5 failures → 15-min lock). Students: school code + school-issued student ID + numeric PIN (4–8 digits; 6-digit PIN generated when not supplied). | `auth.ts`, `schools.ts` (student create) |
| School tenancy | One school per request. Users with several memberships send `x-school-id`; otherwise the single membership is used. Super Admin always passes the school id in the URL. | `middleware/auth.ts` |
| Academic year | Each school has `currentAcademicYear` (default `2026-27`); sections are created per academic year. **Rollover/promotion is not automated yet** — create next-year sections and move students (`PATCH /schools/:id/students/:id { classSectionId }`). Historical attempts keep their `classSectionId`. | `School.currentAcademicYear` |
| Game cap | **2 attempts per student per game per local day**. An attempt is consumed when the game **starts** (so quitting does not refund it). Day boundary = school timezone (default Asia/Kolkata). Per-game `dailyLimit` is configurable by Super Admin. | `services/games.ts`, `Game.dailyLimit` |
| Certificate rules | Levels 1–10, level N requires level N−1. Pass mark 60% (per level). Up to 3 attempts per level per day. Certificate issued automatically once on pass; number `MD-<year>-<6-digit sequence>`; 12-char verification code. No manual approval step. | `CertificationLevel` documents, `services/certificates.ts` |
| Communication | No teacher-to-parent or student-to-student messaging. In-app notifications only (activity assigned, review given, certificate earned, assignments changed). | — |
| Content operations | Super Admin authors learning items, news, quizzes, programmes and certification levels with draft → review → published → archived states. Teachers can author activity quizzes for their own school only. Seed content is illustrative and must be replaced with licensed, approved content. | `routes/content.ts` |
| Exports | CSV export for all school reports (`?format=csv`, formula-injection safe). Certificate PDF via PDFKit. PDF report export not implemented (separate deliverable per spec). | `schools.ts` reports, `services/certificates.ts` |

## Metric definitions (spec §23)

Implemented once in `apps/api/src/services/analytics.ts` and reused by every card, table and chart.

| Metric | Definition |
|---|---|
| Student count | Active student profiles in the selected school/class scope |
| Teacher count | Active teacher memberships in the selected school |
| Average performance | Mean of attempt `percent` for scored attempts in the period; `sampleSize` returned alongside |
| Quiz accuracy | Σ score ÷ Σ max score for completed attempts |
| Activity completion | Completed (activity, student) pairs ÷ pairs for published activities whose start date has passed |
| Programme progress | Completed required items ÷ total required items (per enrolment); averages shown per programme |
| Game attempts | Accepted game attempt records in the date range |
| Certificates issued | Certificates issued in the scope and date range |

## Learning streak

A day (in the school's timezone) counts when the student submitted a quiz, completed a learning item, finished a game,
or completed an assigned activity. The streak is the number of consecutive counted days ending today — or ending
yesterday if nothing has been recorded yet today. (`services/progress.ts`)

## Badges

Awarded only from stored records, computed on the server: Quiz Starter (1 quiz), Quiz Champion (10), Perfect Score,
Curious Learner (5 learning items), 3-Day Streak, Week Warrior (7-day streak), Game On, Programme Explorer, Certified.

## Teacher insights

"Needs support" = average below 50% over at least 2 attempts in the last 60 days, or no attempts in that window.

## Security controls implemented

- bcrypt (cost 12) password/PIN hashing; account lockout after 5 failures.
- 15-minute HS256 access tokens; 30-day refresh tokens stored hashed, rotated on every use; reuse of a rotated token revokes the whole token family; password change / deactivation revokes sessions.
- Every protected request re-checks that the account is active.
- Role checks + school membership + class entitlement + teacher assignment + resource ownership on the server for every route; all school-scoped queries include `schoolId`.
- zod validation on every body/query; Mongo `strictQuery`; ObjectId validation; JSON body limit 1 MB.
- Rate limiting (auth: 50 / 15 min / IP), Helmet security headers, CORS allow-list.
- Quiz answer keys never sent to students before submission; scoring always on the server against the attempted version.
- Audit log for entitlement changes, account status, publishing, plan updates, password resets.
- Public certificate verification returns only number, level, first name + initial, school and date.
- Child privacy: no public profiles, no student-to-student communication, students only see their own data; minimal personal data (no DOB/address/phone stored for students).

**To agree with the client before go-live:** guardian consent process, data retention/deletion periods, and whether
school admins may export student-level CSVs.
