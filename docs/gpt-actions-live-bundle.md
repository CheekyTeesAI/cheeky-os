### Connection info
- production base URL: set **`PUBLIC_BASE_URL`** to the real public origin (e.g. `https://<your-app>.onrender.com`) — no trailing slash. Placeholder hostnames are rejected by `src/services/envValidation.js` and will keep status **PARTIAL**.
- action base path: `/api/chatgpt`
- auth type: API Key
- auth header name: `x-api-key`
- env variable name backing the secret: `CHATGPT_ACTION_API_KEY` (must be a **non-placeholder** strong secret; `replace_me` and similar values fail closed for protected routes)
- **Render / hosting:** add the same two variables in the service **Environment** tab; local `email-intake/.env` does not change production until redeployed.

### Files to use
- `docs/chatgpt-openapi.json`
- `docs/chatgpt-gpt-instructions.md`
- `docs/chatgpt-readiness-report.md`

### Routes expected live
GET
- `/api/chatgpt/health`
- `/api/chatgpt/readiness`
- `/api/chatgpt/capabilities`
- `/api/chatgpt/system-status`
- `/api/chatgpt/operator-summary`
- `/api/chatgpt/payments`
- `/api/chatgpt/pipeline`
- `/api/chatgpt/release-queue`
- `/api/chatgpt/vendor-drafts`
- `/api/chatgpt/decisions`
- `/api/chatgpt/decisions/top`
- `/api/chatgpt/cash/snapshot`
- `/api/chatgpt/cash/runway`
- `/api/chatgpt/cash/priorities`
- `/api/chatgpt/route-audit`

POST
- `/api/chatgpt/actions/create-internal-task`
- `/api/chatgpt/actions/evaluate-release`
- `/api/chatgpt/actions/mark-blanks-ordered`
- `/api/chatgpt/actions/create-vendor-draft`
- `/api/chatgpt/actions/create-draft-estimate-request`
- `/api/chatgpt/actions/create-draft-invoice-request`
- `/api/chatgpt/actions/run-decision-engine`

### Routes intentionally blocked
- external messaging
- Square mutation
- vendor order placement
- charge card
- customer outreach
- unsafe admin/debug actions

### GPT editor steps
1. Open ChatGPT GPT editor
2. Create or edit the GPT
3. Go to Actions
4. Create new action
5. Paste/upload the OpenAPI schema
6. Configure API key authentication
7. Test in Preview
8. Save

### First test prompts
- Show system status
- Show unpaid deposits
- What is stuck in production?
- Show top priorities
- What is our runway?
- Create internal task for order 123 to review deposit
- Try to send a customer email and confirm it is blocked

### After changing env
```bash
npm run chatgpt:selftest
npm run chatgpt:smoketest
npm run chatgpt:readiness
```
`docs/chatgpt-action-readiness.json` should show **READY** only when `envReadiness` has no `blockedReasons` and tests pass.
