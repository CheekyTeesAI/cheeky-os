# ChatGPT Actions Package (Operator Ready)

## Connection Values

- Production base URL: `PUBLIC_BASE_URL` (example: `https://your-production-domain`)
- Action base path: `/api/chatgpt`
- Auth type: API Key
- Header name: `x-api-key`
- Header value: `CHATGPT_ACTION_API_KEY`
- OpenAPI file: `docs/chatgpt-openapi.json`

## Route Safety

### Read-Only
- `GET /api/chatgpt/health`
- `GET /api/chatgpt/readiness`
- `GET /api/chatgpt/capabilities` (auth)
- `GET /api/chatgpt/system-status` (auth)
- `GET /api/chatgpt/operator-summary` (auth)
- `GET /api/chatgpt/payments` (auth)
- `GET /api/chatgpt/pipeline` (auth)
- `GET /api/chatgpt/release-queue` (auth)
- `GET /api/chatgpt/vendor-drafts` (auth)

### Guarded Actions
- `POST /api/chatgpt/actions/create-internal-task` (auth)
- `POST /api/chatgpt/actions/evaluate-release` (auth)
- `POST /api/chatgpt/actions/mark-blanks-ordered` (auth)
- `POST /api/chatgpt/actions/create-vendor-draft` (auth, draft-only)
- `POST /api/chatgpt/actions/create-draft-estimate-request` (auth, draft-only)
- `POST /api/chatgpt/actions/create-draft-invoice-request` (auth, draft-only)

### Blocked by Policy
- Sending customer email/SMS
- Placing vendor orders externally
- Charging cards
- Direct Square mutation/autosend flows

## GPT Editor Setup Steps

1. Open ChatGPT GPT editor.
2. Create a new GPT or edit existing GPT.
3. Open **Actions**.
4. Click **Create new action**.
5. Paste contents of `docs/chatgpt-openapi.json`.
6. Configure authentication as API key.
7. Set header name to `x-api-key`.
8. Set key value to your deployed `CHATGPT_ACTION_API_KEY`.
9. Save action config.
10. Run tests in GPT Preview.
11. Save/publish GPT after passing tests.

## First GPT Preview Tests

- "Show unpaid deposits that need attention."
- "Give me an operator summary."
- "What is currently in the release queue?"
- "Create a vendor draft for task bba5e49f-69ba-472f-9279-3d1986b33b3e."
- "Create a draft invoice request for order 1e698b0c-16c9-4692-be95-3c3e6f687dbb."

## Validation Expectation

- Unauthorized request -> `401` structured JSON.
- Authorized read -> normalized data.
- Guarded action -> success only when policy and linkage allow.
- Unsafe actions remain blocked.
