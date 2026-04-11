# KOS Global Index
Tags: #system #index #navigation
Source references: [Raw Runtime Scan](../raw/2026-04-07-cheeky-api-scan.md), [Raw Pipeline Scan](../raw/2026-04-07-revenue-pipeline-scan.md)

## Summary
Master index of the Cheeky Knowledge Operating System (`/kos`) with grouped files and short summaries.

## Raw
- [2026-04-07-cheeky-api-scan](../raw/2026-04-07-cheeky-api-scan.md): Runtime routes, auth layering, and scheduler observations from current code.
- [2026-04-07-revenue-pipeline-scan](../raw/2026-04-07-revenue-pipeline-scan.md): Order->quote->invoice flow and AI intake behavior extraction.

## Wiki
- [Runtime Routing](../wiki/runtime-routing.md): How Express entrypoint composes middleware and business routes.
- [Authentication Model](../wiki/authentication-model.md): API key enforcement design and behavior.
- [Revenue Pipeline](../wiki/revenue-pipeline.md): Unified order/quote/invoice orchestration and fallback model.
- [Pricing Engine](../wiki/pricing-engine.md): Deterministic pricing assumptions and margin tiers.
- [AI Intake Behavior](../wiki/ai-intake-behavior.md): OpenAI-first parser with fallback and pipeline mapping.
- [Automation Jobs](../wiki/automation-jobs.md): Follow-up/reactivation job behavior and scheduling.

## Concepts
- [Route Registration](../concepts/route-registration.md): Canonical route-to-handler mapping behavior.
- [Auth Gate](../concepts/auth-gate.md): API key entry control concept.
- [Pipeline Orchestration](../concepts/pipeline-orchestration.md): Handler composition into one revenue flow.
- [Deterministic Pricing](../concepts/deterministic-pricing.md): Rule-based quote computation model.
- [Draft Financial Object](../concepts/draft-financial-object.md): DRAFT-only billing artifact concept.
- [Fallback Parsing](../concepts/fallback-parsing.md): Safety parser when AI extraction fails.
- [Fail-Safe Execution](../concepts/fail-safe-execution.md): Graceful degradation principles.
- [Customer Reactivation](../concepts/customer-reactivation.md): Dormant customer revival strategy.

## Outputs
- [Full Cycle 2026-04-07](../outputs/full-cycle-2026-04-07.md): First compile/lint cycle output and next actions.

## System
- [Ontology](ontology.md): Canonical entities and relationships.
- [Tasks](tasks.md): Active improvement backlog.
- [Health](health.md): Lint/integrity findings.

## Linked references
- [KOS Ontology](ontology.md)
- [KOS Health Report](health.md)

## Insights
- Current corpus has complete coverage of newly added growth endpoints and automation modules.
- Business extension is ready for next ingest of real quote/customer history.

## Backlinks
- Referenced by: [Output Build Report](../outputs/full-cycle-2026-04-07.md), [KOS Health Report](health.md)

## Related concepts
- [Route Registration](../concepts/route-registration.md)
- [Pipeline Orchestration](../concepts/pipeline-orchestration.md)
