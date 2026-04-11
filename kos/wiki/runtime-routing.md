# Runtime Routing
Tags: #wiki #runtime #express #routing
Source references: [Raw Runtime Scan](../raw/2026-04-07-cheeky-api-scan.md)

## Summary
Cheeky OS runtime is centralized in one Express entrypoint that composes middleware, auth, operational routes, and growth automation endpoints.

## Key points
- Entrypoint loads dotenv before application code.
- Middleware stack includes JSON parsing, security headers, CORS, and global API key validation.
- Protected operational endpoints are mounted after auth middleware.
- Growth endpoints include intake, quote, draft invoice, AI pipeline execution, follow-up, and reactivation.

## Linked references
- [Authentication Model](authentication-model.md)
- [Revenue Pipeline](revenue-pipeline.md)
- [Automation Jobs](automation-jobs.md)

## Insights
- A single routing root improves discoverability but raises blast radius for compile-time failures.
- Route-level feature growth is healthy; central index and linting are now mandatory to prevent drift.

## Backlinks
- Referenced by: [System Index](../system/index.md), [System Health](../system/health.md)

## Related concepts
- [Route Registration](../concepts/route-registration.md)
- [Fail-Safe Execution](../concepts/fail-safe-execution.md)
