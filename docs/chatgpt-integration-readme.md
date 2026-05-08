# ChatGPT Integration Readme

## Overview

Cheeky OS exposes a ChatGPT-safe operator surface at `/api/chatgpt/*`.
The bridge is additive and default-safe: read-heavy, guarded internal actions, and draft-only where external risk exists.

## Available Routes

### Read
- `GET /api/chatgpt/readiness`
- `GET /api/chatgpt/capabilities`
- `GET /api/chatgpt/system-status`
- `GET /api/chatgpt/operator-summary`
- `GET /api/chatgpt/payments`
- `GET /api/chatgpt/pipeline`
- `GET /api/chatgpt/release-queue`
- `GET /api/chatgpt/vendor-drafts`
- `GET /api/chatgpt/route-audit`

### Guarded Actions
- `POST /api/chatgpt/actions/create-internal-task`
- `POST /api/chatgpt/actions/evaluate-release`
- `POST /api/chatgpt/actions/mark-blanks-ordered`
- `POST /api/chatgpt/actions/create-vendor-draft`
- `POST /api/chatgpt/actions/create-draft-estimate-request`
- `POST /api/chatgpt/actions/create-draft-invoice-request`

## Safe vs Blocked

### Safe
- Read system and operational state
- Create guarded internal tasks (when linkages exist)
- Evaluate release and mark blanks ordered through existing guardrails
- Create draft request records for estimate/invoice handling

### Blocked by Default
- Sending emails or SMS automatically
- Placing vendor orders externally
- Charging cards
- Auto-sending invoices
- Direct Square mutation paths

## Env Requirements

Required baseline:
- `AUTOPILOT=true`
- `AUTOPILOT_MODE=controlled`
- `ENABLE_PROACTIVE=true`

Optional follow-up mode:
- `AUTO_FOLLOWUP=true`
- `FOLLOWUP_MODE=draft_only`
- `FOLLOWUP_AUTO_SEND=false`

## ChatGPT Custom Actions Setup

1. Deploy Cheeky OS and verify `/api/chatgpt/readiness` responds.
2. Use `docs/chatgpt-openapi.json` as the Custom Actions OpenAPI definition.
3. Set server URL in the OpenAPI `servers[0].url` to your live host.
4. If auth is required in your environment, add it to the OpenAPI spec and route middleware.

## First Commands to Test

- "Show unpaid deposits"
  - Calls `GET /api/chatgpt/payments`
- "What is stuck in production?"
  - Calls `GET /api/chatgpt/release-queue`
- "Create a vendor draft for task 123"
  - Calls `POST /api/chatgpt/actions/create-vendor-draft`
- "Create a draft invoice request for order 456"
  - Calls `POST /api/chatgpt/actions/create-draft-invoice-request`

## Notes

- ChatGPT actions return explicit success/blocked status and audit reference.
- If a capability is unavailable safely, the route reports blocked/unavailable instead of simulating success.
