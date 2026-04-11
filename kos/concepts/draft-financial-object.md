# Draft Financial Object
Tags: #concept #billing #square #draft
Source references: [Revenue Pipeline](../wiki/revenue-pipeline.md), [Raw Pipeline Scan](../raw/2026-04-07-revenue-pipeline-scan.md)

## Definition
A draft financial object is a non-published billing artifact (estimate/invoice) created for review and follow-up without customer notification.

## Key principles
- DRAFT-only creation path.
- Never auto-send or auto-publish in safe mode.
- Maintain mock fallback for availability when external APIs fail.

## Related concepts
- [Fail-Safe Execution](fail-safe-execution.md)
- [Pipeline Orchestration](pipeline-orchestration.md)

## Derived insights
- Real-first with mock fallback protects revenue workflow continuity during third-party outages.

## Backlinks
- Referenced by: [Revenue Pipeline](../wiki/revenue-pipeline.md), [Automation Jobs](../wiki/automation-jobs.md)
