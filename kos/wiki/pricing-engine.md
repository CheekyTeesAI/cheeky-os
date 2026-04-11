# Pricing Engine
Tags: #wiki #pricing #margin #quote
Source references: [Raw Pipeline Scan](../raw/2026-04-07-revenue-pipeline-scan.md), `email-intake/src/api/quote.generate.ts`

## Summary
Quote generation computes total price from item-level quantity extraction, garment assumptions, print cost, and tiered margins.

## Key points
- Quantity is parsed from each item string (`/\\d+/`).
- Base costs:
  - shirt blank: 4
  - hoodie blank: 12
  - print cost: 6 per unit
- Margin is tiered by quantity, from 2.0 (single) down to 0.2 (500+).
- Final quote total is rounded to nearest dollar.

## Linked references
- [Revenue Pipeline](revenue-pipeline.md)
- [AI Intake Behavior](ai-intake-behavior.md)

## Insights
- Deterministic math enables predictable quoting and testability.
- Parsing free-text items introduces ambiguity; future schema enforcement can reduce variance.

## Backlinks
- Referenced by: [System Index](../system/index.md), [Ontology](../system/ontology.md)

## Related concepts
- [Deterministic Pricing](../concepts/deterministic-pricing.md)
- [Pipeline Orchestration](../concepts/pipeline-orchestration.md)
