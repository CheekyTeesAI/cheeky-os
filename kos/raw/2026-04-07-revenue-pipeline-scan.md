# Revenue Pipeline Scan (2026-04-07)
Tags: #raw #pipeline #sales #automation
Source references: `email-intake/src/api/pipeline.run.ts`, `email-intake/src/api/quote.generate.ts`, `email-intake/src/api/invoice.create.ts`, `email-intake/src/api/ai.intake.ts`

## Summary
Revenue flow now exists as composable handlers: order creation, deterministic quote generation, draft invoice creation (Square-first with mock fallback), and orchestration through a single pipeline endpoint.

## Key points
- `createOrder` returns temporary order object (safe mode, no DB write).
- `generateQuote` uses quantity-sensitive margin logic and rounded total.
- `createInvoice` tries Square draft estimate creation first, then returns mock draft on failure.
- `runPipeline` chains order -> quote -> invoice and returns combined object.
- `aiIntake` parses text with OpenAI structured JSON first, fallback parser second, then always calls pipeline.

## Linked references
- [Revenue Pipeline](../wiki/revenue-pipeline.md)
- [Pricing Engine](../wiki/pricing-engine.md)
- [AI Intake Behavior](../wiki/ai-intake-behavior.md)

## Insights
- Pipeline resilience depends on graceful degradation: Square failure still returns usable mock draft.
- AI parsing quality impacts quote accuracy; fallback keeps continuity but may reduce precision.

## Backlinks
- Referenced by: [System Index](../system/index.md), [Ontology](../system/ontology.md)

## Related concepts
- [Pipeline Orchestration](../concepts/pipeline-orchestration.md)
- [Deterministic Pricing](../concepts/deterministic-pricing.md)
- [Draft Financial Object](../concepts/draft-financial-object.md)
