# Decision Engine Signal + Action Compatibility Map

## Signals available

- `PAYMENT_SIGNAL`
  - unpaid deposits from `lead.depositRequired/depositPaid`
  - order payment truth via `order.depositPaidAt`
- `PRODUCTION_SIGNAL`
  - order status: `PRODUCTION_READY`, `PRINTING`, `QC`
  - stale timing via `updatedAt`
- `RELEASE_SIGNAL`
  - task release fields: `releaseStatus`, `orderReady`, `blanksOrdered`, `productionHold`
- `TASK_SIGNAL`
  - active task coverage and missing task detection
- `PIPELINE_SIGNAL`
  - lead/task counts and status distribution
- `FOLLOWUP_SIGNAL`
  - quote/deposit age and unresolved follow-up windows

## Actions available

- `CREATE_INTERNAL_TASK`
  - implemented via guarded task creation (requires order->job linkage)
- `ADVANCE_SAFE_INTERNAL_STATUS`
  - safe review state only (`QUOTE_SENT -> ATTENTION_REQUIRED`, `DEPOSIT_PAID -> READY_FOR_ORDER_REVIEW`)
- `EVALUATE_RELEASE`
  - implemented via `evaluateTaskReleaseAction(taskId)`
- `CREATE_VENDOR_DRAFT`
  - implemented via `createVendorOrderDraftAction(taskId)` with existing release gates
- `BLOCK_ONLY`
  - safety block recommendations where execution is not allowed or unsafe

## Reuse points

- Agent loop signals: `src/services/agentLoop.js`
- Controlled autopilot actions: `src/services/autopilotControlledActions.js`
- Mobile command layer: `src/services/mobileCommandExecutor.js`
- ChatGPT guarded actions: `src/routes/chatgpt.route.js`
- Existing action audit: `src/operator/actionAudit.js`
