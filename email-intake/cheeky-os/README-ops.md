# Cheeky OS — operations handbook (additive)

Operational documentation for **`email-intake/cheeky-os/`**. This file does **not** replace vendor or Prisma migrations docs; it orients Patrick, Jeremy, and maintainers around the **cockpit + growth** layers.

---

## Local run

- **Directory:** run from **`email-intake/`** (not repo root alone).
- **Command:** `npm start` → loads **`scripts/cheekyOsLoadEnv.js`** then **`cheeky-os/server.js`**.
- **Environment:** **`email-intake/.env`** overrides shell `PORT` / `CHEEKY_OS_PORT` (**dotenv override: true**). Expect **`PORT=3000`** unless you edit `.env`.
- **Node:** Prefer **Node 18.x** per **`email-intake/package.json`** `engines`.

---

## Production / Render notes

- **BIND:** **`0.0.0.0`** with port from **`PORT`** (same resolution as **`listenPort()`** in **`services/cheekyOsRuntimeConfig.service.js`**).
- **DATABASE_URL:** PostgreSQL datasource in **`prisma/schema.prisma`**; local Prisma failures surface as degraded reads (cockpit placeholders, never raw stack traces to operators).
- **Square:** Treat as **financial read truth** where integrated; cockpit snapshot may return **cached** payload when connectors fail (**no crash**).

---

## Route categories (high level)

| Area | Paths (examples) | Purpose |
|------|-------------------|---------|
| Health | **`GET /health`**, **`/system/health`** | Liveness / probes |
| Blocker cockpit (Phase 1) | **`GET /api/dashboard/blockers`**, **`GET /api/dashboard/production-cockpit`**, **`GET /api/operator/what-now`** | Blockers first, Jeremy plain English |
| Friction | **`POST /api/ops/friction-log`**, **`GET …/recent`**, **`GET /api/ops/shift-summary`**, **`POST /api/ops/shift-handoff`** | Operational pain log + shift rollup |
| Approvals gate (Phase 2) | **`GET /api/approvals/pending`** (legacy + **`phase2Approvals`**), **`POST /api/approvals/approve`**, **`POST /api/approvals/reject`**, **`GET /api/approvals/:id`** | Approval-gated drafts & decisions (**Patrick** rules on high-impact) |
| Drafting | **`GET /api/drafts/pending`**, **`POST /api/drafts/generate`**, garment consolidation | WO / garment / follow-up drafts (no execution) |
| Growth (Phase 3) | **`GET /api/growth/leads/scores`**, **`GET /api/growth/leads/:id`**, **`POST /api/outreach/generate`**, **`GET /api/outreach/drafts`**, **`GET /api/operator/morning-brief`** | Scoring + outreach draft files + executive brief (**`morning-brief`** is mounted early in **`server.js`** before other **`/api/operator`** routers so it is not shadowed). |

---

## Dashboard surfaces

- **Operator HTML:** **`/cheeky-os-ui/operator-dashboard.html`** (static mount under cockpit block in **`server.js`**).
- Cockpit renders **operations first**, then Phase 2 panels, **then Patrick growth strip** — Jeremy can scroll past growth.

---

## Approval system overview

1. **Legacy JSONL approvals** (`workflow/approvalEngine`) — continue to surface under **`GET /api/approvals/pending`** as **`approvals`**.
2. **Phase 2 JSON gate files** (**`pending-approvals.json`**, **`approval-history.json`**) — appended when drafting/outreach/generate routes create gated actions; surfaced as **`phase2Approvals`** on the pending list endpoint.
3. **`POST /api/approvals/approve`** / **`reject`** target the **phase-2 gate** by **`actionId`** (body uses **`actionId`**, **`notes`/`reason`**; Patrick signal via **`x-actor`** or **`body.actor`**).
4. **No autonomous approve** anywhere in cockpit/growth builders.

---

## Drafting overview

| Draft type | Stored under | Approval |
|-----------|---------------|----------|
| Work order | `data/drafts/work-order/` | `work_order_draft` |
| Garment PO | `data/drafts/garment-order/` | `garment_order` |
| Customer follow-up | `data/drafts/follow-up/` | `customer_message` |
| Outreach (Phase 3) | `data/outreach-drafts/` | **`growth_outreach`** |

Everything is **filesystem + gate** visibility — **never auto-send**.

---

## Lead scoring cache

- **File:** `cheeky-os/data/lead-scores.json` (auto-written by **`growth/leadScoringService.js`**).
- **Refresh:** `GET /api/growth/leads/scores?refresh=1` recomputes from latest Prisma order snapshot grouped by **`email`** (fallback keyed by **`customerName`** heuristic).

---

## Morning brief cache

- **File:** `cheeky-os/data/morning-brief-cache.json` — last successful **`GET /api/operator/morning-brief`** envelope for degraded reads.

---

## Safe failure UX (operator-facing)

Handlers should return **`safeFailureResponse`** (from **`utils/safeFailureResponse.js`**) shapes **without leaking stacks** — HTTP **200 + envelope** preferred for brittle cockpit routes so mobiles still render placeholders.

---

## Data storage paths (defaults)

Relative to **`cheeky-os/agent/taskQueue.DATA_DIR`** (**`cheeky-os/data/`**):

- `pending-approvals.json`, `approval-history.json`
- `friction-log.json`, `shift-handoffs.json`
- `square-snapshot.json`, `morning-brief-cache.json`
- Subfolders: **`drafts/`**, **`outreach-drafts/`**
- Phase 5: **`intake-self-service-queue.json`**, **`customer-status-links.json`** (share tokens for read-only status page)

---

## Phase 5 v3.0 — customer self-service + mobile ops (additive)

**Principles:** read-only customer status, internal intake drafts only, approval-gated review, no autonomous sends, no customer auth.

### HTTP routes (examples)

| Method | Path | Purpose |
|--------|------|---------|
| GET | **`/api/customer/search`** | Operator/customer-safe lookup by `q` (name, email, phone digits, order #). Returns summary envelope + optional **share** URL token in `data.safeLink`. |
| GET | **`/api/customer/status`** | Read-only status by `?token=` (opaque **cs-** token from `customer-status-links.json`). |
| POST | **`/api/intake/self-service`** | Public form submission → internal queue row + **`self_service_intake_review`** approval (no quote, no production move). |
| GET | **`/api/intake/queue`** | Operator snapshot of pending self-service rows (Jeremy / Patrick cockpit). |
| GET | **`/api/monitoring/system-health`** | Operational confidence envelope (connectors, approvals backlog, friction signals). |

### Static pages (under **`/cheeky-os-ui/`**)

- **`customer-intake.html`** — mobile-friendly self-service form (POSTs to **`/api/intake/self-service`**).
- **`customer-status.html`** — optional bookmarked status view when staff issues a tokenized link.

### Operator dashboard

- **`/cheeky-os-ui/operator-dashboard.html`** — sticky ops strip (blocker hint + health mini), collapsible **New intake queue / customer lookup**, **Jeremy training** toggle (localStorage), **Patrick remote** toggle (existing).

---

## Phase 6 — lightweight hooks only (no implementation)

Placeholder expansion points (**documented only**; no live jobs, packages, or portal shipped here):

1. **`customer-portal`** — OAuth or magic-link auth, richer history exports (defer until Phase 6 product decision).
2. **`analytics-export`** — scheduled CSV/warehouse handoff keyed off existing KPI snapshots (defer).
3. **`advanced-crm-sync`** — bidirectional CRM beyond current Prisma + Square reads (defer).
4. **`advanced-automation`** — explicit human-in-the-loop job runner only after policy review (defer).

---

## Phase 7 v3.0 — three-view cockpit + Cheeky-AI command layer

### Dashboard views (`operator-dashboard.html`)

| View | Intent |
|------|--------|
| **Cheeky Advisor** (default) | One-glance rollup: synthesized priority sentence, blocker counts, approvals backlog cue, monitoring health heuristic, and AI-linked next actions. Patrick executive strips stay inside a collapsible `<details>` tag until expanded. |
| **Jeremy** | Growth / executive wrap hidden — execution + blocker lanes + drafts + intake. |
| **Patrick** | CEO/growth cockpit — KPI, ads, approvals context; Advisor strip suppressed to reduce duplication. |

Cheeky-AI Helpbot docks bottom-center — **`POST /api/cheeky-ai/ask`**, **`GET /api/cheeky-ai/search`**, **`GET /api/cheeky-ai/suggestions`**.

### Accounting visibility (read-only)

- **`GET /api/accounting/summary`**, **`/ar-aging`**, **`/export-preview`** — heuristic AR buckets from sampled Prisma rows + KPI echoes. **Square + CPA remain authoritative.**

### Reporting + backup

- **`GET /api/reporting/advanced/weekly|monthly`**
- **`GET /api/reporting/advanced/export/:type`** where `type` ∈ `orders|customers|kpis|approvals|friction|accounting-rows`
- **`GET /api/backup/snapshot?reason=`** writes JSON artefact bundles under **`data/backup-snapshots/`**
- **`GET /api/backup/status`**

### Team pulse

- **`GET /api/team/activity`** — composite timeline (approvals history, friction, drafts) + printed checklists (no auth).

### Full system status

- **`GET /api/system/full-status`** — merges monitoring health, backup meta, KPI freshness hints, draft backlog counts.

### Failure playbook

- If dashboard HTML loads but data pills stay red: hit **`/health`**, then **`/api/system/full-status`**, then verify Prisma + `.env` `DATABASE_URL`.
- If exports empty: confirm Prisma returns orders; CSV layer never fabricates rows.
- Mobile: use Reload cockpit + Helpbot quick prompts; three-view toggle persists in `localStorage` key **`cheeky_dashboard_view`**.

### Daily trust routines (Phase 7 hardening)

- **Jeremy start-of-day:** open **Cheeky Advisor** first, clear blocker + approval cards, then switch to Jeremy view for production execution.
- **Patrick nightly review:** switch to Patrick view, read `nightly-growth-review`, resolve approvals backlog, then confirm `system/full-status`.
- **If degraded:** continue in read-only mode, rely on cached timestamps, and avoid speculative commitments until Square/Prisma checks recover.
