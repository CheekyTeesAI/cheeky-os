# Pipeline Orchestration
Tags: #concept #pipeline #composition
Source references: [Revenue Pipeline](../wiki/revenue-pipeline.md)

## Definition
Pipeline orchestration composes multiple handlers into one transactional business flow with a unified output.

## Key principles
- Reuse existing handlers rather than duplicating logic.
- Keep each stage bounded: order, quote, invoice.
- Return combined artifacts for downstream automation.

## Related concepts
- [Deterministic Pricing](deterministic-pricing.md)
- [Draft Financial Object](draft-financial-object.md)

## Derived insights
- Function reuse creates behavioral consistency between standalone and orchestrated endpoints.

## Backlinks
- Referenced by: [Revenue Pipeline](../wiki/revenue-pipeline.md), [AI Intake Behavior](../wiki/ai-intake-behavior.md)
