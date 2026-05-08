# Mobile Operator Surface Audit

## Reusable Surface

### READ COMMAND READY
- `/api/chatgpt/system-status`
- `/api/chatgpt/operator-summary`
- `/api/chatgpt/payments`
- `/api/chatgpt/release-queue`
- `/api/chatgpt/vendor-drafts`
- Prisma-backed summaries in `chatgpt.route.js`

### ACTION COMMAND READY
- `evaluateTaskReleaseAction(taskId)`
- `createVendorOrderDraftAction(taskId)`
- Guarded task creation pattern in `chatgpt.route.js` (`jobId` linkage required)

### NEEDS NORMALIZATION
- Existing `/voice/run` flow is generic command executor and not mobile-safe for this phase.
- Existing routes return mixed shapes; mobile bridge normalizes compact response envelope.

### BLOCKED
- External messaging actions (email/sms send)
- External vendor ordering
- Direct Square/payment mutation actions
- Unsupported ambiguous high-risk intents

## Existing Voice Surface

- Existing route: `cheeky-os/routes/voice.js`
- New mobile bridge adds additive adapter endpoint:
  - `POST /api/mobile/operator/voice`
  - same parser/executor as mobile text command endpoint

## Existing Audit Helpers

- `src/operator/actionAudit.js` file log helper exists and is reused.
- `AuditLog` persistence exists and is used when available.
