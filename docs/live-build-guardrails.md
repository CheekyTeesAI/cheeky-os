# Live build guardrails (GPT Actions)

1. The `/api/chatgpt/*` surface is a **protected live operator interface** once deployed. Treat it like production API traffic.
2. Future changes must **not** break:
   - `GET /api/chatgpt/health`
   - `GET /api/chatgpt/readiness` (must include `envReadiness` from `src/services/envValidation.js`)
   - `src/services/chatgptActionAuth.js` (fail closed; no placeholder `CHATGPT_ACTION_API_KEY` for protected routes)
   - JSON responses from normalizer-backed routes (no raw HTML on success paths)
   - Guarded `POST /api/chatgpt/actions/*` routes (success or structured blocked only)
3. Every merge that touches ChatGPT routes, auth, or OpenAPI should run:
   - `npm run chatgpt:selftest` (or `node scripts/chatgpt-selftest.js`)
   - `npm run chatgpt:smoketest` (or `node scripts/chatgpt-live-smoketest.js`) against a running instance
   - `npm run chatgpt:readiness` (or `node scripts/generate-chatgpt-readiness-report.js`)
4. If self-test or smoketest regresses, **mark the build failed** and fix before shipping; do not relax `envValidation` or auth to “make green.”
