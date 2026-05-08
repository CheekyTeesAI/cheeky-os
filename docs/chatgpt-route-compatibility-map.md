# ChatGPT Operator Route Compatibility Map

This map classifies current operator-facing routes for ChatGPT bridge safety.

## READ_SAFE
- `/api/operator/readiness`
- `/api/system/status`
- `/api/operator/summary`
- `/api/operator/pipeline`
- `/api/operator/payments`
- `/api/operator/release`
- `/api/operator/vendor-drafts`
- `/api/operator/agent-insights`
- `/api/operator/autopilot-status`
- `/api/operator/followups/status`

## DRAFT_SAFE
- `/api/operator/vendor-drafts/:id/create` (draft-only payload generation)
- `/api/chatgpt/actions/create-draft-estimate-request` (internal draft request record)
- `/api/chatgpt/actions/create-draft-invoice-request` (internal draft request record)

## GUARDED_INTERNAL_ACTION
- `/api/operator/release/:id/evaluate`
- `/api/operator/release/:id/mark-blanks-ordered`
- `/api/chatgpt/actions/create-internal-task`

## BLOCKED_FOR_CHATGPT
- `/api/operator/payments/:id/mark-paid` (payment mutation)
- Any route that sends email/SMS externally
- Any route that mutates Square directly
- Any route that places vendor orders externally
