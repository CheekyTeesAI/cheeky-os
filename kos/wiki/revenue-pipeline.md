# Revenue Pipeline
Tags: #wiki #sales #pipeline #invoice
Source references: [Raw Pipeline Scan](../raw/2026-04-07-revenue-pipeline-scan.md)

## Summary
Revenue flow composes handlers in sequence: order intake -> quote generation -> draft invoice creation, exposed via `/cheeky/pipeline/run`.

## Key points
- `createOrder` captures normalized order envelope.
- `generateQuote` applies deterministic quantity/margin pricing.
- `createInvoice` uses Square draft creation first, then mock fallback.
- `runPipeline` executes all steps and returns a combined payload.
- `aiIntake` feeds parsed text into the same pipeline contract.

## Linked references
- [Pricing Engine](pricing-engine.md)
- [AI Intake Behavior](ai-intake-behavior.md)
- [Automation Jobs](automation-jobs.md)

## Insights
- Reused function composition keeps behavior aligned across manual and AI channels.
- Square-first + mock fallback preserves availability while external billing integration matures.

## Backlinks
- Referenced by: [System Index](../system/index.md), [System Health](../system/health.md), [Tasks](../system/tasks.md)

## Related concepts
- [Pipeline Orchestration](../concepts/pipeline-orchestration.md)
- [Draft Financial Object](../concepts/draft-financial-object.md)
