# DevRann free-tier infrastructure plan

Research date: 2026-11-24. Free-tier terms can change; verify before production launch.

## 1. Current architecture

- Frontend/API: Next.js 15 App Router on Vercel. 87 `route.ts` files under `src/app/api`.
- Auth: Firebase Authentication (client + Admin SDK).
- Database: Cloud Firestore, project `codexarena-4990f`.
- Code execution: Judge0 CE adapter (`src/services/judge-engine.ts`) and optional Piston adapter. Both require a self-hosted endpoint; no provider is configured by default.
- AI: Genkit + Gemini (`GEMINI_API_KEY`), optional.
- Monitoring: Sentry (`@sentry/nextjs`), optional.
- Mobile: Capacitor Android wrapper (not a separate backend).
- Local judge lab: `infra/judge0/docker-compose.yml` (Judge0 1.13.1, PostgreSQL 16, Redis 7). Blocked locally because Docker/Java are not installed.

External dependencies observed in source: Firebase, Judge0, Piston, Gemini/Genkit, Sentry, Google Analytics, Vercel.

## 2. Proposed managed architecture (zero-budget start)

| Layer | Service | Role |
|---|---|---|
| Web/API | Vercel Hobby (personal dev/test) | Next.js pages, API routes, Monaco static assets |
| Auth | Firebase Spark Auth | Email/OAuth sign-in, ID tokens |
| Database | Firestore Spark | Problems, content, secrets, submissions, progress, profiles, challenges, chat |
| Realtime | Firestore listeners | Chat and limited presence only |
| Scheduling | Firebase scheduled functions / controlled admin workflow | Daily and weekly challenge publication |
| Judge | Self-hosted Judge0 CE (future, requires VM) | Sandboxed execution |
| AI | Gemini free tier (optional) | Mentor, review, complexity |
| Monitoring | Sentry free tier (optional) | Error reporting |

No additional service is introduced without a demonstrated technical need.

## 3. Services that can genuinely run at ₹0

- Vercel Hobby for non-commercial development and preview testing.
- Firebase Spark Authentication for eligible projects.
- Cloud Firestore Spark within daily quotas.
- Firestore realtime listeners within quota.
- Next.js API routes as serverless functions.
- Firebase scheduled functions within Spark/Blaze limits where enabled.
- Gemini and Sentry free tiers, subject to their own quotas.

## 4. Services blocked by the zero-budget constraint

- A managed, unlimited code-execution sandbox. No reliable provider exists at ₹0.
- Self-hosted Judge0 CE requires a VM (4 GB RAM, 20 GB disk, Docker), which is paid outside the free tiers.
- Large-scale AI usage beyond Gemini free limits.
- High-volume Firestore workloads beyond Spark quotas.

## 5. Quota and cost risks

Firestore Spark indicative limits:
- 50,000 document reads/day
- 20,000 document writes/day
- 20,000 document deletes/day
- 1 GB stored data
- 10 GB/month network egress

Expected high-cost features:
- Problem catalog browsing and search: reads scale with page size and filters.
- Submission history and progress aggregation: repeated reads if not cached or paginated.
- Realtime chat: listener cost and write amplification.
- Challenge status: submission queries per user per page load.
- AI features: token and request quotas.

Mitigations already present or required:
- Server-side pagination with `limit` and cursors.
- Rate limiting on judge and problem APIs.
- Idempotent challenge claim transactions.
- Count aggregation endpoint (`/api/problems/stats`) instead of client-side full scans.
- Limited realtime subscriptions; prefer on-demand fetch for challenge status.
- Do not expose hidden tests; only store public samples in `problemContent`.

## 6. Firestore data model (current)

Collections used include `problems`, `problemContent`, `problemSecrets`, `problemStats`, `users`, `submissions`, `practiceProgress`, `progress`, `learning`, `challenges`, `chat*`, `friends`, `rooms`, `contests`, `missions`, `achievements`, `shop`, `studyGroups`, `career*`, `projects`, `hub*`, `notifications`, `rateLimits`, and admin/audit collections.

Authorization is enforced by `firestore.rules` (26.8 KB). Rules tests require the Firestore emulator (`npm run test:rules`), which is currently unavailable locally.

## 7. Judge integration plan

- Keep the existing adapter architecture and server-side credentials.
- Remove implicit public provider fallbacks; the adapter already throws `ExecutionBackendUnavailableError` when no provider is configured.
- Treat `JUDGE_UNAVAILABLE` as a distinct state in UI and tests.
- Do not use Firestore, browser JavaScript, or ordinary Vercel functions as a code sandbox.
- Future provider: self-hosted Judge0 CE on a small VM (estimate: $5–$20/month depending on provider and RAM) or a paid managed sandbox if budget is approved.
- Before production, run the full test matrix: Accepted, Wrong Answer, Compile Error, Runtime Error, TLE, MLE, Internal Error, Judge Unavailable.

## 8. Feature implementation priorities

1. Problem ingestion and explorer (implemented locally, emulator validation blocked).
2. Judge adapter hardening and honest unavailable states (implemented contract; runtime blocked).
3. Daily/weekly challenges (implemented APIs/UI; persistence blocked by emulator).
4. Workspace UX and progress integration (partially implemented).
5. Contests/rating, messaging, servers/channels, profiles/settings, learning roadmap, analytics/AI mentor (planned; quota impact must be assessed per feature).

## 9. Owner actions required

- Decide whether Vercel Hobby's non-commercial restriction is acceptable for the current stage.
- Provide a Firebase project with emulator access in CI or install Java locally for `firebase emulators:exec`.
- Approve a budget for Judge0 hosting or a managed sandbox before enabling real judging.
- Approve any AI usage beyond free-tier limits.
- Review and deploy Firestore rules/indexes only after rules tests pass.

## 10. Remaining integration requirements

- Firebase Emulator runtime for importer and rules tests.
- Real Judge0 instance for execution verdict validation.
- Scheduled challenge publication mechanism and admin authorization review.
- Load testing for Firestore quotas under expected traffic.
- Data retention and backup policy before production use.