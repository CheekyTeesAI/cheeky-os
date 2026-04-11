# Automation Jobs
Tags: #wiki #jobs #followup #reactivation
Source references: [Raw Runtime Scan](../raw/2026-04-07-cheeky-api-scan.md), `email-intake/src/jobs/followup.engine.ts`, `email-intake/src/jobs/reactivation.engine.ts`

## Summary
Automation layer currently includes follow-up and reactivation engines with safe-first behavior, plus schedulers from runtime startup.

## Key points
- Follow-up engine:
  - detects stale quotes (>24h from mock dataset)
  - supports DRY_RUN mode (`FOLLOWUP_DRY_RUN`)
  - uses Resend API when not in dry run
- Reactivation engine:
  - identifies inactive customers (>60 days)
  - assigns outreach priority based on spend
- Scheduler:
  - daily interval triggers follow-up engine
  - existing cron and hourly jobs continue in parallel

## Linked references
- [Runtime Routing](runtime-routing.md)
- [Authentication Model](authentication-model.md)

## Insights
- DRY_RUN toggle is critical safety control before fully automated outreach.
- Next maturity step is replacing mock records with real quote/customer sources.

## Backlinks
- Referenced by: [System Index](../system/index.md), [Tasks](../system/tasks.md), [System Health](../system/health.md)

## Related concepts
- [Fail-Safe Execution](../concepts/fail-safe-execution.md)
- [Customer Reactivation](../concepts/customer-reactivation.md)
