# What was built today

- Stabilized route/runtime layer:
  - `/api/operator/run`, `/api/ai/execute`, `/api/reports/*`, `/api/sales/*`, `/api/memory/*`, `/api/tasks/:id/advance`.
- Completed modular service layer under `email-intake/src/services`:
  - `squareOperator.js`, `reporting.js`, `salesEngine.js`, `memory.js`, `skillEngine.js`.
- Added/confirmed skill metadata store:
  - `email-intake/ai/skills/skills.json`.
- Finalized dashboard wiring to live operational endpoints:
  - Needs Printing, Garment Orders, Deposit Follow-ups, Today Summary.
- Updated control-layer templates for phone use:
  - `control/queue.md`, `control/templates/base_prompt.md`.

# What is working

- Core API routes are mounted and reachable:
  - `/api/operator/run`
  - `/api/ai/execute` (returns 503 when `AI_API_KEY` is missing, as expected)
  - `/api/production/queue`
  - `/api/operator/deposit-followups`
  - `/api/operator/garment-orders`
  - `/api/reports/run`
  - `/api/reports/customer`
  - `/api/sales/call-list`
  - `/api/sales/log`
  - `/api/memory/insights`
  - `/api/memory/kaizen`
- Dashboard endpoint wiring is correct in `email-intake/public/dashboard.js`:
  - `/api/production/queue`
  - `/api/operator/garment-orders`
  - `/api/operator/deposit-followups`
  - `/api/reports/run?period=today` with fallback `/summary/today`.
- Deterministic command routing exists in operator for:
  - invoice/outstanding/report/call-list/kaizen/memory + skill-aware writing flows.

# What is partial

- Several operator flows depend on Postgres-backed context/services. With DB unavailable, context fetches can delay or degrade command responses.
- `write follow-up` and `summarize report` depend on OpenAI path for full output quality; deterministic fallback exists but may be less useful.
- `/api/ai/execute` requires `AI_API_KEY`; without it, command wrapper returns 503 by design.

# Known warnings

- Runtime warnings observed:
  - `Can't reach database server at HOST:5432` from multiple dist services used by AI context.
- Square token is invalid/unset in this environment (`SQUARE_ACCESS_TOKEN` warning), so Square write/read actions are limited.
- Route files exist in both slash and backslash path snapshots in git status outputs; avoid duplicating edits across mirrored path entries.

# Exact next recommended build

1. **DB connectivity hardening pass**: add short-circuit/faster fail paths around `/api/ai/context` dependencies so operator commands do not hang when DB is down.
2. **Operator timeout guard**: add explicit timeout envelope for high-latency AI/DB branches (`runOperatorWithContext`, skill-writing branch).
3. **Smoke harness update**: include deterministic `/api/operator/run` command checks with timeout + expected action assertions.
4. **Small docs sync**: add one route matrix doc for `/api/reports`, `/api/sales`, `/api/memory`, `/api/ai`.

# Morning startup checklist

1. `cd email-intake`
2. Confirm env:
   - `OPENAI_API_KEY` (optional but recommended)
   - `AI_API_KEY` (required for `/api/ai/execute`)
   - `DATABASE_URL` (required for full operator context)
   - `SQUARE_ACCESS_TOKEN` (required for Square live actions)
3. Run build if TS changed:
   - `npm run build`
4. Start server:
   - `npm start`
5. Quick health checks:
   - `GET /health`
   - `GET /api/production/queue`
   - `GET /api/reports/run?period=today`
   - `GET /api/sales/call-list`
   - `GET /api/memory/insights`
6. Open dashboard:
   - `http://127.0.0.1:3000/dashboard.html`
7. Verify control queue file is ready for mobile use:
   - `control/queue.md`
