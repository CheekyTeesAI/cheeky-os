# End of day — 2026-04-14 — Cheeky OS (email-intake HTTP)

## New routes / modules (recent stabilization scope)

**Customer reply loop (inbound email → order/proof/comms)**  
- `GET /api/comms/replies` — dashboard + tooling JSON.  
- Intake: `POST /api/intake/email`, Outlook webhook — branch when message looks like a customer reply (`customerReplyService` / `customerReplyClassifier`).  
- `src/services/customerReplyService.ts`, `src/lib/customerReplyClassifier.ts`.  
- Prisma: `CustomerCommunication` fields for classification / `needsReview` / `matchConfidence` (migration applied per environment).

**Work orders (production packet)**  
- `GET /api/work-orders/ready`, `POST /api/work-orders/generate`, `GET /api/work-orders/:orderId`, `GET /api/work-orders/:orderId/print` (HTML), `POST /api/work-orders/:orderId/mark-printed`.  
- Alias mount: `GET /work-orders/:orderId/print` (same router).  
- `src/services/workOrderService.ts`, `cheeky-os/routes/workOrders.js`.  
- Prisma: `workOrderNumber`, `workOrderGeneratedAt` (with existing `workOrderStatus`).

**Quote intelligence**  
- `POST /api/quotes/calculate`, `GET /api/quotes/rules`.  
- `src/services/quoteEngine.ts`, `cheeky-os/routes/quotes.js`.

**Operator / dashboard**  
- Extended `cheeky-os/routes/operatorRun.js` and `src/operator/operatorRouter.ts` for replies, work orders, quotes.  
- `public/dashboard.html` + `dashboard.js`: Customer Replies, Work Orders Ready, Quote calculator sections.

---

## What is working (when `npm run build` + DB migrated)

- Cheeky OS server (`npm start` from `email-intake`) serves API + static dashboard.  
- Dist-backed routes load `email-intake/dist/services/*.js` — **run `npm run build` after TS changes**.  
- Customer reply pipeline: deterministic classification, order match tiers, high-confidence proof actions, comms logging, memory events.  
- Work order: readiness gates, packet JSON, HTML print view, mark-printed.  
- Quote engine: deterministic costs, margin bands, Square prep object (manual next step to invoice/draft).

---

## What is partial / follow-up

- **Prisma migrate / generate** on each deploy target if migrations not applied.  
- **OpenAI fallback** for reply classification: not implemented (deterministic only).  
- **Quote → Square**: `buildSquareDraftFromQuote` prepares payloads; auto-create draft not wired (Square `customerId` required for draft order API).  
- **Daily digest**: quote risk not merged into `dailySummaryService` (memory events exist for analysis).  
- **`/api/orders`**: two routers (`garmentOrderMark`, `orderFiles`) — paths must stay non-overlapping (convention: verify on new endpoints).

---

## Recommended next session

1. Run migrations on staging/production; smoke `GET /health`, `GET /api/comms/replies`, `GET /api/work-orders/ready`, `POST /api/quotes/calculate`.  
2. Optional: wire quote memory counts into an ops summary if needed.  
3. Optional: OpenAI fallback for ambiguous customer replies only (narrow, guarded).

---

## Route registration note

Intentional duplicate **prefix** mounts (not duplicate handlers on the same path):  
`/api/proofs` + `/proofs`, `/api/work-orders` + `/work-orders`, `/api/operator` + `/operator`, `/api/*` mirrors for several routers.  
`/api/operator` stacks deposit followups, garment list, and `operatorRun` — order is intentional.

---

## package.json scripts (email-intake)

| Script | Role |
|--------|------|
| `start` | `node cheeky-os/server.js` — production HTTP |
| `build` / `typecheck` | `tsc` — required for dist routes |
| `dev` | TS API (`voice.run.ts`) — separate from cheeky-os server |
| `test` | alias to `typecheck` |

No script changes required for stabilization.
