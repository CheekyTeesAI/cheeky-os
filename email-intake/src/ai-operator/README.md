# AI Operator Layer — Phase 1 (v3 envelope)

## Architecture (`email-intake/src/ai-operator/`)

| Module | Role |
|--------|------|
| **`intentEngine.js`** | Normalizes `{ intent, params }` from upstream (ChatGPT). |
| **`operatorRouter.js`** | `runOperatorCommand({ intent, params, approvalToken? })` → registry → gate → handler → audit → **`operatorResponse`**. |
| **`toolRegistry.js`** | Central tool definitions: `name`, `description`, `riskLevel`, `requiredEnvVars`, `enabled`, `handler`. |
| **`approvalGate.js`** | `READ_ONLY` allow · `APPROVAL_REQUIRED` allow only with approval · `DANGEROUS` always block. |
| **`auditLogger.js`** | Console JSON (`timestamp`, `intent`, `tool`, `params`, `durationMs`, `success`, `error`); **never throws**. |
| **`operatorResponse.js`** | `{ ok: true, data, meta }` / `{ ok: false, error: { code, message } }`. |
| **`config/operator.config.js`** | Version flags (no secrets). |
| **`config/permissions.js`** | Intent risk documentation. |
| **`connectors/*`** | Safe integrations; missing creds → `NOT_CONFIGURED` + `missingEnvVars`, no throws. |

## Intent flow — “What did Jessica’s last email say?”

1. Upstream maps to intent **`GET_LAST_EMAIL_FROM_CONTACT`** with `params: { contact: "Jessica" }`.
2. Router resolves **`getLastEmailFromContact`**, checks **`enabled`**, runs **`approvalGate`** (`READ_ONLY` → pass).
3. Handler calls **`emailConnector.getLastEmailFromContact`**.
4. Success envelope example:

```json
{
  "ok": true,
  "data": {
    "status": "NOT_CONFIGURED",
    "contact": "Jessica",
    "subject": null,
    "from": null,
    "receivedAt": null,
    "snippet": null,
    "summary": "…",
    "missingEnvVars": ["…"]
  },
  "meta": { "intent": "GET_LAST_EMAIL_FROM_CONTACT", "tool": "getLastEmailFromContact", "durationMs": 1 }
}
```

5. Audit line written with timing.

## Approval

- **WRITE-class tools** (future): pass a non-empty **`approvalToken`** (Phase 1: presence only; verification is a later phase) or legacy `approval` / `approved` boolean for tests.
- **`DANGEROUS`**: always blocked (`DANGEROUS_BLOCKED`).

## HTTP test

`GET /api/operator/test-last-email?contact=Jessica`  
Returns v3 envelope; HTTP **422** when `ok: false` (e.g. bad intent if extended), **400** for missing `contact`.

## Extensibility

1. Add `tools/<name>.js` with `handler`.
2. Register in **`toolRegistry.js`**.
3. Map intent in **`operatorRouter.js`** (`INTENT_TO_TOOL`).
4. Keep mutations **`APPROVAL_REQUIRED`**; never auto-send / auto-charge / auto-production from Phase 1 paths.

See also `prompts/operatorSystemPrompt.md`.
