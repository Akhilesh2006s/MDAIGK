# Mango Dude AIGK

Experiential learning platform for Classes 1–10: common-core learning, news & GK, educational games, certifications and
premium enrichment programmes. MERN + React Native, TypeScript throughout.

| App | Users | Tech | Folder |
|---|---|---|---|
| Web | Super Admin, School Admin (web only) — **and, in phase 1, Teacher & Student portals** | React 19 + Vite | `apps/web` |
| Mobile (phase 2) | Teacher, Student (Android-first) — built and tested, release later | React Native (Expo) | `apps/mobile` |
| API | all | Node.js + Express 5 + Mongoose | `apps/api` |
| Shared | — | constants, brand tokens, API types | `packages/shared` |
| Database | — | MongoDB (Atlas) | — |

Docs: [Architecture & data model](docs/ARCHITECTURE.md) · [Business rules & open decisions](docs/BUSINESS_RULES.md) ·
[Demo accounts](docs/DEMO_ACCOUNTS.md) · API reference: `http://localhost:4000/api/docs` (OpenAPI JSON at `/api/openapi.json`).

## Prerequisites

Node.js 20+ (tested on 24), npm 10+. For mobile: Android Studio emulator or a phone with Expo Go.

## 1. Install

```bash
npm install
```

(Installs the API, web and shared workspaces and builds `packages/shared`. The mobile app installs separately — see step 4.)

## 2. API

Create `apps/api/.env` from `apps/api/.env.example` and set `MONGO_URI` (Atlas connection string including the database
name) and a random `JWT_ACCESS_SECRET` (32+ chars). If Node cannot resolve `mongodb+srv` hosts on Windows
(`querySrv ECONNREFUSED`), add `DNS_SERVERS=8.8.8.8,1.1.1.1`.

```bash
npm run seed            # create indexes, reference data and three demo schools (add -- --reset to wipe the DB first)
npm run dev:api         # http://localhost:4000  (docs at /api/docs)
```

No database available? Run everything against a throw-away in-memory MongoDB replica set (seeded on start):

```bash
npm run dev:api:memory
```

Production build: `npm run build -w @mango/api && npm start -w @mango/api`.

## 3. Admin web app

```bash
npm run dev:web         # http://localhost:5173, proxies /api to http://localhost:4000
```

Sign in as Super Admin `admin@mangodude.in` or a School Admin (see [demo accounts](docs/DEMO_ACCOUNTS.md)).
Build: `npm run build -w @mango/web` → static files in `apps/web/dist`.

## 4. Mobile app (Teacher + Student)

```bash
cd apps/mobile
npm install
npx expo start          # press "a" for Android emulator
```

Set `EXPO_PUBLIC_API_URL` if the API is not at the default (`http://10.0.2.2:4000` on the Android emulator, which maps to
the host's localhost). For a physical phone use your computer's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000`.

## Tests

```bash
npm test -w @mango/api      # Jest + Supertest on an in-memory MongoDB replica set
npm test -w @mango/web      # Vitest + React Testing Library
```

API suite covers: role access for all four roles and denied cases, tenant isolation, class locks via direct API calls,
premium entitlements (enabled / disabled / expired), game limits (normal, boundary, concurrent), quiz scoring /
duplicate submission / changed versions / invalid answers, certificates (pass/fail, prerequisite, duplicate award, PDF,
public verification) and the end-to-end flow (Super Admin → School Admin → Teacher → Student → dashboards).

## Scope boundaries

Hosting, DevOps, CI/CD, monitoring, third-party SMS/email/push/payment/AI/news integrations, attendance, video content and
admin mobile apps are out of scope (see the scope document §26).
