# Auth Gate
Tags: #concept #security #api-key
Source references: [Authentication Model](../wiki/authentication-model.md)

## Definition
Auth gate is the API-key enforcement layer that controls access to protected routes.

## Key principles
- Single source of truth from environment (`API_KEY`).
- Accept key via query or header for client flexibility.
- Reject unauthorized requests with stable error shape.

## Related concepts
- [Route Registration](route-registration.md)
- [Fail-Safe Execution](fail-safe-execution.md)

## Derived insights
- Trimming both provided and expected keys removes a common operational failure class.

## Backlinks
- Referenced by: [Authentication Model](../wiki/authentication-model.md), [System Health](../system/health.md)
