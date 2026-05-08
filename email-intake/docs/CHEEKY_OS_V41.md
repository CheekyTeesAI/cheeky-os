## Cheeky OS v4.1 — ASCII architecture (HTTP process)

```
                    ┌─────────────────────────────────────────┐
                    │         cheeky-os/server.js               │
                    │  Express · CORS · rate-limit (v4 router) │
                    └───────────────┬─────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
 /dashboard ─────────► dashboard-data JSON ◄────────── /metrics (Prometheus)
 (HTML+poll)               (auth middleware)               (optional auth)
       │
       └──► universalIntake (POST /api/intake) ──► Dataverse ──► ctSync audits
                                                             └──► Observability rings
                                                                   └──► Hooks (*.hook.js)
       ┌──────────────── operatorAutonomousWorker ◄───────────┘
       │          (polls dist/intakeQueuePrintingService)
       └──► Dedup ring (CHEEKY_WORKER_DEDUP_MS) + CHEEKY_WORKER_STATELESS

Alerts: CHEEKY_ALERT_* ticker ──► Slack webhook / Resend email
Structured log: CHEEKY_LOG_JSON_FILE / CHEEKY_LOG_JSON_CONSOLE
Admin audit: CHEEKY_ADMIN_AUDIT_LOG_FILE (JSON lines)
```

### Contributing

1. Run `npm run build` in `email-intake` before exercising the autonomous worker (`dist/` must include intake queue TS).
2. Add intake side-effects via `cheeky-os/hooks/intake/*.hook.js` exporting `universalIntakeAfterCreate`.
3. Open PRs scoped to one subsystem (auth, observability, Dataverse).
