# Route Registration
Tags: #concept #routing #api
Source references: [Runtime Routing](../wiki/runtime-routing.md)

## Definition
Route registration is the explicit mapping of HTTP methods and paths to handler functions in the runtime entrypoint.

## Key principles
- Register core middleware before protected business routes.
- Keep one canonical mount location for new feature routes.
- Preserve deterministic path naming for discoverability.

## Related concepts
- [Auth Gate](auth-gate.md)
- [Pipeline Orchestration](pipeline-orchestration.md)

## Derived insights
- Centralized route visibility reduces integration confusion during rapid feature addition.

## Backlinks
- Referenced by: [Runtime Routing](../wiki/runtime-routing.md), [System Index](../system/index.md)
