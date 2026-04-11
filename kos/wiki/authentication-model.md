# Authentication Model
Tags: #wiki #auth #api-key #security
Source references: [Raw Runtime Scan](../raw/2026-04-07-cheeky-api-scan.md)

## Summary
Authentication uses an API key from either query (`apiKey`) or header (`x-api-key`) and validates against trimmed `process.env.API_KEY`.

## Key points
- Single source of truth is environment variable `API_KEY`.
- Auth middleware allows select public/system routes and enforces auth for protected routes.
- Validation trims expected and provided values to reduce whitespace mismatch failures.
- Invalid key responses return consistent JSON shape with `stage: "auth"`.

## Linked references
- [Runtime Routing](runtime-routing.md)
- [Automation Jobs](automation-jobs.md)

## Insights
- Query and header support lowers integration friction across browser tools and service clients.
- Auth consistency improved reliability of `/cheeky/orders` endpoint under real testing.

## Backlinks
- Referenced by: [System Index](../system/index.md), [Ontology](../system/ontology.md)

## Related concepts
- [Auth Gate](../concepts/auth-gate.md)
- [Fail-Safe Execution](../concepts/fail-safe-execution.md)
