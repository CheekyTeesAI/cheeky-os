# AI Intake Behavior
Tags: #wiki #ai #intake #nlp
Source references: [Raw Pipeline Scan](../raw/2026-04-07-revenue-pipeline-scan.md), `email-intake/src/api/ai.intake.ts`

## Summary
AI intake parses messy customer text into structured JSON using OpenAI first, then falls back to deterministic local rules, and always forwards to the shared pipeline.

## Key points
- Requires request body field `text`.
- OpenAI path requests strict JSON with customer, email, items, and notes.
- Fallback path detects shirt/hoodie keywords and applies default quantities.
- Pipeline input maps structured items to string lines (`"<qty> <type>"`).

## Linked references
- [Revenue Pipeline](revenue-pipeline.md)
- [Pricing Engine](pricing-engine.md)

## Insights
- Dual parser strategy balances intelligence and uptime.
- Data quality at this stage directly affects quote realism and downstream invoice quality.

## Backlinks
- Referenced by: [System Index](../system/index.md), [System Health](../system/health.md)

## Related concepts
- [Fallback Parsing](../concepts/fallback-parsing.md)
- [Pipeline Orchestration](../concepts/pipeline-orchestration.md)
