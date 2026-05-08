# Next build handoff

## GPT Actions status (as of last `docs/chatgpt-action-readiness.json` run)

- See `docs/chatgpt-readiness-report.md` and `docs/chatgpt-action-readiness.json` for the current `overallVerdict` (READY / PARTIAL / BLOCKED).
- **READY** requires: non-placeholder `CHATGPT_ACTION_API_KEY`, `https` `PUBLIC_BASE_URL` to the live host, passing smoketest/selftest, and no `envReadiness.blockedReasons`.

## Safe operator capabilities (intended)

- Read: system status, operator summary, payments queue, pipeline, release queue, vendor drafts, decisions, cash snapshot/runway/priorities.
- Guarded internal: internal task, release evaluation, vendor draft creation, draft estimate/invoice *requests*, decision engine run.
- Mobile operator: same read/guarded surface via `/api/mobile/operator/*` where implemented.

## Intentionally blocked or fail-closed

- Unsupervised customer email/SMS, Square charge/mutation, external vendor order placement, unsafe admin.
- Protected ChatGPT routes when `CHATGPT_ACTION_API_KEY` is missing or **placeholder** (see `src/services/envValidation.js`).

## Required commands before a future merge (ChatGPT-affecting work)

```bash
# From repo root, with server running and env set for that instance
set SELFTEST_BASE_URL=https://your-live-origin
set CHATGPT_ACTION_API_KEY=***strong-secret-matching-server***
node scripts/chatgpt-selftest.js
node scripts/chatgpt-live-smoketest.js
node scripts/generate-chatgpt-readiness-report.js
```

## Recommended next expansion layer

- **FLOW BUILDER + PROCESS MANIFESTOR** (`/api/flow/plan`, build manifests, Cursor prompts) — use for requests that are not yet implemented without breaking the live GPT bridge.
