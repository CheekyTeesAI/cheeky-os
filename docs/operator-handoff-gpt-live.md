# Operator Handoff: GPT Live

## Ready Right Now?
- Use **`docs/chatgpt-action-readiness.json`** `overallVerdict` as source of truth. **READY** requires a non-placeholder API key, `https` `PUBLIC_BASE_URL` to your real host, and passing self-test + smoketest.

## Exact Connection Values
- Base URL: set **`PUBLIC_BASE_URL`** in your host’s environment (e.g. Render **Environment**): e.g. `https://<your-service>.onrender.com`
- Auth header: `x-api-key`
- Auth value: **`CHATGPT_ACTION_API_KEY`** in the same hosting env (never commit real values; see `email-intake/.env.example` keys only)
- Schema file: `docs/chatgpt-openapi.json`
- Validation: `src/services/envValidation.js` — placeholder secrets and template URLs are **not** treated as production-ready

## First Prompts to Run in GPT Preview
- Show system status
- Show unpaid deposits
- What is stuck in production?
- Show top priorities
- What is our runway?
- Create internal task for order 123 to review deposit
- Try to send a customer email and confirm it is blocked

## Likely Failure Modes
- Invalid API key -> protected routes return `401` JSON Unauthorized
- Wrong base URL -> timeouts/404/not reachable from GPT
- Route not mounted -> endpoint returns structured not found JSON
- Protected route without auth -> `401` JSON Unauthorized
- Schema mismatch -> GPT action fails to parse/execute operation call

## What Success Looks Like
- Health and readiness routes return JSON in GPT preview
- Protected reads work only with valid API key
- Decision and cash reads return structured JSON payloads
- Guarded actions return either success or blocked JSON (never raw crash)
- Unsafe/unsupported action attempts fail closed

## Intentionally Blocked
- External customer messaging automation
- Square mutation/charging flows
- External vendor order placement
- Unsafe admin/debug operation surface
