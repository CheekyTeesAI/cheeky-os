# Cheeky OS — ChatGPT main entry contract (v8)

Patrick uses **ChatGPT** (or another client) as the conversational shell. Cheeky OS remains the source of operational truth — **reads, drafts, and approval queues only** unless an existing gated workflow explicitly permits more.

## Primary endpoint

`POST /api/operator/command`

Preferred base URL: your deployed Cheeky OS host (e.g. `https://<host>`). For local smoke tests: `http://127.0.0.1:<PORT>`.

### Request body (JSON)

```json
{
  "query": "What should I focus on today?",
  "requestedBy": "patrick",
  "mode": "read_only"
}
```

- **query** (required): natural-language operator question or command (read-only classifier + optional fall-through to `/api/operator/query` router).
- **requestedBy**: actor label for audit trails.
- **mode**:
  - `read_only` (default): no destructive side effects; intercepts obvious “send/charge/order” phrasing.
  - `draft`: same read behavior today; reserved for future draft-producing commands.
  - `approval_required`: reserved for flows that enqueue human approval (still no auto-send / no Square mutation from this router).

### Success response shape

The handler returns HTTP 200 with:

```json
{
  "success": true,
  "intent": "today_focus",
  "answer": "Today's focus: …",
  "recommendedActions": [],
  "requiredApprovals": [],
  "sources": [{ "type": "dashboard", "label": "…" }],
  "drafts": [],
  "approvalsNeeded": [],
  "dashboardLinks": [{ "label": "Today's snapshot", "href": "/api/operator/today" }],
  "confidence": 0.74,
  "meta": { "requestedBy": "patrick", "mode": "read_only" }
}
```

Older clients may additionally map:

| Contract field        | Routed from                          |
|----------------------|----------------------------------------|
| `answer`             | `answer`                              |
| `recommendedActions`| `recommendedActions`                  |
| `drafts`            | backlog hints + approval-linked rows  |
| `approvalsNeeded`   | `approvalsNeeded` / pending approvals|
| `dashboardLinks`    | `dashboardLinks`                      |
| `sources`           | `sources`                             |

## Companion read APIs (dashboards)

- `GET /api/operator/today`
- `GET /api/operator/blocks`
- `GET /api/operator/approvals`
- `GET /api/operator/production-board`
- `GET /api/operator/cash-risks`
- `GET /api/dashboard/main`
- `GET /api/dashboard/production`
- `GET /api/dashboard/intake`
- `GET /api/dashboard/cash`
- `GET /api/dashboard/art`
- `GET /api/dashboard/garments`

## Draft APIs (internal only)

- `POST /api/workorders/create-draft` — persists **local** draft JSON (`cheeky-os/data/work-order-drafts.jsonl`). Not a Square mutation.
- `POST /api/garments/create-carolina-made-draft` — internal Carolina Made draft (`garment-order-drafts.jsonl`). **No auto-email, no auto-order.**

## Hard safety rules

Cheeky OS **must not** (via these v8 routes):

- send email or SMS automatically
- place garment vendor orders automatically
- charge, refund, or otherwise mutate Square
- mutate Dataverse or production state implicitly

Allowed: read intelligence, create **internal** drafts, surface **pending** approvals, recommend next human actions.

## Static operator UI

When the server is running, open:

`/cheeky-os-ui/operator-dashboard.html`

(e.g. `http://127.0.0.1:3000/cheeky-os-ui/operator-dashboard.html`)
