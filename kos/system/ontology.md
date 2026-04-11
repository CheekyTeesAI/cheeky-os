# KOS Ontology
Tags: #system #ontology #knowledge-model
Source references: [Raw Runtime Scan](../raw/2026-04-07-cheeky-api-scan.md), [Raw Pipeline Scan](../raw/2026-04-07-revenue-pipeline-scan.md)

## Summary
Ontology defines canonical entities, relationships, and semantic rules for Cheeky OS knowledge compilation.

## Key points
- Entities:
  - Route
  - Handler
  - PipelineStage
  - Quote
  - DraftInvoice
  - Job
  - Concept
- Relationships:
  - `Route -> handled_by -> Handler`
  - `Handler -> composes -> PipelineStage`
  - `PipelineStage -> outputs -> Quote|DraftInvoice`
  - `Job -> influences -> RevenueOpportunity`
  - `Concept -> derived_from -> WikiArticle`

## Linked references
- [Runtime Routing](../wiki/runtime-routing.md)
- [Revenue Pipeline](../wiki/revenue-pipeline.md)
- [Automation Jobs](../wiki/automation-jobs.md)

## Insights
- Current ontology supports both deterministic and AI-assisted workflow nodes without changing consumer contracts.

## Backlinks
- Referenced by: [System Index](index.md), [System Health](health.md), [Output Build Report](../outputs/full-cycle-2026-04-07.md)

## Related concepts
- [Pipeline Orchestration](../concepts/pipeline-orchestration.md)
- [Draft Financial Object](../concepts/draft-financial-object.md)
