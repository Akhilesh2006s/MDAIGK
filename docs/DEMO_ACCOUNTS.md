# Demo accounts (development seed only)

Created by `npm run seed` (or automatically by `npm run dev:api:memory`). **Change or remove these before any real deployment.**
The values are defined in `apps/api/src/scripts/seed.ts` (`DEMO`).

| Role | App | Login |
|---|---|---|
| Super Admin | Web | `admin@mangodude.in` / `MangoAdmin@2026` |
| School Admin — Green Valley (Classes 1–5, Basic) | Web | `admin@gvs.edu.in` / `SchoolAdmin@2026` |
| School Admin — Sunrise (Classes 1–8, Pro) | Web | `admin@sun.edu.in` / `SchoolAdmin@2026` |
| School Admin — Lotus (Classes 1–10, Premium) | Web | `admin@lts.edu.in` / `SchoolAdmin@2026` |
| Teacher | Mobile | `priya@gvs.edu.in`, `rahul@gvs.edu.in`, `lakshmi@gvs.edu.in` (same pattern for `@sun.edu.in`, `@lts.edu.in`) / `Teacher@2026` |
| Student | Mobile | School code `GVS001`, student ID e.g. `GVS401A`, PIN `1234` |

Student IDs follow `<first 3 letters of school code><class><nn><section>`, e.g. `GVS401A`…`GVS406A`, `GVS401B`, `SUN601A`, `LTS801A`, `LTS1001A`.

Demo schools:

| School | Code | Plan | Granted classes | Programmes enabled |
|---|---|---|---|---|
| Green Valley School | GVS001 | Basic | 1–5 (6–10 locked) | Young Scientist |
| Sunrise Public School | SUN002 | Pro | 1–8 (9–10 locked) | AI Academy, Young Scientist |
| Lotus International School | LTS003 | Premium | 1–10 | All five |
