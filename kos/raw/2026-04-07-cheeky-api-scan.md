# Cheeky API Runtime Scan (2026-04-07)
Tags: #raw #runtime #routes #auth
Source references: `email-intake/src/api/voice.run.ts`, `email-intake/src/middleware/auth.ts`

## Summary
Runtime entrypoint mounts core middleware, global auth, business routes, and automation jobs. New growth routes are present for order intake, quoting, invoice creation, pipeline execution, AI intake, follow-up, and reactivation.

## Key points
- Entrypoint is `voice.run.ts` and loads dotenv first.
- Global auth middleware is active before protected routes.
- New routes registered:
  - `POST /cheeky/orders/create`
  - `POST /cheeky/quote/generate`
  - `POST /cheeky/invoice/create`
  - `POST /cheeky/pipeline/run`
  - `POST /cheeky/ai/intake`
  - `GET /cheeky/followup/run`
  - `GET /cheeky/reactivation/run`
- Scheduler hooks:
  - follow-up cron every 30 min
  - unpaid follow-up hourly
  - daily follow-up engine interval

## Linked references
- [Runtime Routing](../wiki/runtime-routing.md)
- [Authentication Model](../wiki/authentication-model.md)
- [Automation Jobs](../wiki/automation-jobs.md)

## Insights
- Route surface now supports full revenue path from intake through draft financial object creation.
- Background jobs are expanding faster than observability; this increases need for linted health reports.

## Backlinks
- Referenced by: [System Index](../system/index.md), [System Health](../system/health.md)

## Related concepts
- [Route Registration](../concepts/route-registration.md)
- [Auth Gate](../concepts/auth-gate.md)
