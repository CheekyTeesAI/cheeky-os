PASSED: Night 5 Control

- In-memory `LastRun`: `{ input, output, timestamp }` via `setLastRun` / `getLastRun` (`src/debug/store.ts`)
- `/cheeky/voice/run` records last run after pipeline completes (manual, email, validation failures that return after parse, gatekeeper fail, success, 500 catch when `pipelineInput` is set)
- `GET /cheeky/debug/last` — `{ lastRun }` (requires `x-api-key`)
- `POST /cheeky/debug/replay` — re-runs last `input` through **manual** pipeline brain → gatekeeper → router (no intake email); updates `lastRun` with fresh output (requires `x-api-key`)
- `stepLog` in `logger.ts`: `console.log` for `[brain]`, `[gatekeeper]`, `[router]`, `[engine]`; wired in `voice.run` + replay

TEST OUTPUT:

`npm install && npx prisma generate && npm run typecheck && npm test` — PASS

`USE_MOCK=true`, `POST /cheeky/voice/run`:

```json
{"success":true,"invoiceId":"inv:0-ChD5hYitg6orSAYHhUDWwp-QEIQP","status":"SENT","confidence":0.99}
```

`GET /cheeky/debug/last`:

```json
{"lastRun":{"input":"create invoice for 10 shirts at 15 each for Night5 Test Co","output":{"success":true,"invoiceId":"inv:0-ChD5hYitg6orSAYHhUDWwp-QEIQP","status":"SENT","confidence":0.99},"timestamp":1774487731796}}
```

`POST /cheeky/debug/replay`:

```json
{"success":true,"invoiceId":"inv:0-ChDs3_hDB8FXMn3kDNAsEQSvEIQP","status":"SENT","confidence":0.99}
```

(second Square invoice id confirms re-run)

---

PASSED: Night 4 Intelligence (see prior commits / history for details)

Prior: Nights 2–3 intake email + follow-up cron

BLOCKED:
- none

NEXT READY:
YES
