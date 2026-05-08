# Printavo-style layer on CHEEKY OS v1.0

This document extends the **strict deposit gate** (unchanged) with **unified shop operations**: configurable pipeline, production board, auto tasks, proofs, POs, and reporting.

**Hard rule:** Production board columns, tasks, and POs are **downstream of** `GATE_PASSED` + `ct_deposit_paid`. No feature here creates a second path that marks money or unlocks production without the Square webhook + intake correlation.

---

## Architecture (where truth lives)

| Concern | Primary (recommended) | Mirror |
|--------|------------------------|--------|
| Money / deposit | Node + Square webhook | `ct_deposit_paid`, `ct_status` |
| Job checklist | Node `Task` (already: `taskGenerator`, routing) | `ct_production_task` + `ct_prisma_task_id` |
| Board column | `ct_intake_queue.ct_production_stage_code` | Optional sync from Node `Order.status` / `productionStatus` |
| Proof rounds | Node `proofStatus` / files | `ct_proof_asset` + parent `ct_proof_*` |
| PO / blanks | `ct_purchase_order` + Node `garmentOperatorService` | Flow on receive updates both |

---

## Dataverse — new / updated artifacts

| File | Purpose |
|------|---------|
| `dataverse/ct_intake_queue.schema.json` | Extended: stage, dates, proof mirror, margin fields, bottleneck |
| `dataverse/ct_shop_config.schema.json` | Pipeline JSON + auto-task templates (optional) |
| `dataverse/ct_stage_definition.schema.json` | Kanban columns: code, label, color, order |
| `dataverse/ct_production_task.schema.json` | Checklist rows linked to intake |
| `dataverse/ct_purchase_order.schema.json` | Blank PO + receive status |
| `dataverse/ct_proof_asset.schema.json` | Proof file URLs + round status |

Publish all into the same solution as existing `ct_*` tables.

---

## Node (email-intake)

**Phase A implemented:** `cheeky-os/services/productionKickoff.service.js` runs **after** `mirrorDepositToDataverse` succeeds: `ensureJobShellForDepositedOrder` → `generateTasksForOrder` → `PATCH` intake `ct_production_stage_code` (default **`DEPOSIT_PAID`**). Optional: **`CHEEKY_CT_MIRROR_TASKS_TO_DV=true`** creates **`ct_production_task`** via OData.

**Also present:** `ensureArtPrepTask`, `ensureProofApprovalTask`, `syncPrintTaskBlocksForOrder`, `garmentOperatorService`, `proofRoutingService`.

**Still recommended (later phases):**

1. **Internal HTTP** (protected): `POST /api/internal/production/sync-tasks` for manual replays.
2. **Proof send:** when `sendProofForOrder` runs, create/update **`ct_proof_asset`** row and parent proof fields.
3. **PO receive:** when `markGarmentsReceived` runs, optional **`PATCH`** **`ct_purchase_order`** to `RECEIVED`.

---

## Power Automate

| Flow | Trigger | Actions |
|------|---------|---------|
| **Funded → checklist** | Dataverse: `ct_intake_queue` **when** `ct_status` becomes `GATE_PASSED` (or `ct_deposit_paid` true, depending on ordering) | HTTP to Node internal sync OR List rows of templates + Apply to each **Create** `ct_production_task`; call `generateTasksForOrder` equivalent for Prisma |
| **Proof sent** | Node webhook or PA “proof” button | **Create** `ct_proof_asset` `SENT`, email/Teams via template |
| **PO submitted** | Canvas **Patch** `ct_purchase_order` `ORDERED` | Notify vendor (existing pattern) |
| **PO received** | User sets `RECEIVED` | **Patch** intake `ct_production_stage_code`; optional HTTP to Node `markGarmentsReceived` |

Use **child flows** with **service principal**; never bypass gate in conditions.

---

## Power Apps screens

1. **Production Board** — see **`POWER_FX_PRODUCTION_BOARD.md`**: horizontal columns from `ct_stage_definition`, cards filtered by `ct_production_stage_code`.
2. **Calendar** — same doc: filter by `ct_target_ship_date` / `ct_production_due_date`.
3. **Job detail** — vertical checklist gallery on `ct_production_task`; proof sub-gallery on `ct_proof_asset`; PO tab on `ct_purchase_order`.
4. **Shop settings** (admin) — edit `ct_stage_definitions` or single `ct_shop_config` row; **read-only** gate fields.

---

## Reporting tiles (bottlenecks & margin)

Add views (**not** new tables required):

| View / formula idea | KPI |
|---------------------|-----|
| Funded WIP, stage `ART_PREP` or proof `SENT`, age \> 3 days | Art / proof bottleneck count |
| PO `ORDERED` where `ct_expected_at` \< Today() and intake funded | Late blanks |
| `ct_quoted_subtotal - ct_estimated_job_cost` where both non-null | Rough contribution (tile + drill) |

Extend **`POWER_FX_TILES.md`** with these once fields exist.

---

## Prioritized implementation steps

### Phase A — Board shell + Node kickoff (done in repo)

1. Create Dataverse tables + seed **`ct_stage_definition`** (`seed_ct_stage_definition.json`, `SEED_STAGES_INSTRUCTIONS.md`).
2. Canvas **Production Board** (`POWER_FX_PRODUCTION_BOARD.md`) — funded-only.
3. **`productionKickoff.service.js`** invoked from **`ctSync.mirrorDepositToDataverse`** after successful PATCH.

### Phase B — PA-only task mirror (optional)

4. If not using **`CHEEKY_CT_MIRROR_TASKS_TO_DV`**, add PA flow on **`GATE_PASSED`** to create **`ct_production_task`** rows from templates (idempotent).

### Phase C — Proofs (1 week)

5. Add **`ct_proof_asset`**; on proof send in Node, dual-write row + parent **`ct_proof_status`**.
6. Customer reply flow (existing classifier) updates latest round **`APPROVED`/`REJECTED`**.

### Phase D — PO & receive (1 week)

7. Canvas PO form + **`ct_purchase_order`**; receive action updates status and optionally calls Node garment receive.

### Phase E — Dashboards (ongoing)

8. Bottleneck + margin tiles using new intake fields; **Power BI** optional on same Dataverse.

### Phase F — Hardening

9. Security roles: ops **cannot** write `ct_deposit_paid`, `ct_status` (gate transitions); can write stage, tasks, PO.
10. Regression tests: gate still blocks orphan payments; board changes do not touch money.

---

**Related:** `FOUNDER_CHEEKY_OS_V1_LOCKED.md`, `POWER_FX_PRODUCTION_BOARD.md`, `POWER_FX_TILES.md`, `GO_LIVE_CHECKLIST.md`.
