# Fallback Parsing
Tags: #concept #ai #resilience #parsing
Source references: [AI Intake Behavior](../wiki/ai-intake-behavior.md)

## Definition
Fallback parsing is deterministic extraction logic used when AI parsing fails or returns invalid output.

## Key principles
- Never block pipeline execution solely due to AI failure.
- Use conservative default quantities and categories.
- Preserve original text in notes for human review.

## Related concepts
- [Deterministic Pricing](deterministic-pricing.md)
- [Fail-Safe Execution](fail-safe-execution.md)

## Derived insights
- Fallback parsing is a reliability mechanism, not a quality replacement for structured AI extraction.

## Backlinks
- Referenced by: [AI Intake Behavior](../wiki/ai-intake-behavior.md), [System Health](../system/health.md)
