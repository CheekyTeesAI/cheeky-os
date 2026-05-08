# Cheeky OS Schema Stability Notes

## 1) Known schema mismatches (current)
- Dataverse intake queue may not expose `cr2d1_status`, `cr2d1_customer_name`, or `cr2d1_order_name`.
- Some Prisma environments are missing `Order.mockupUrl`.
- Runtime behavior now favors degraded mode over boot failure.

## 2) Temporary boot flags
- `CHEEKY_OS_BOOT_INTAKE_SELFTEST=false` skips the optional intake startup self-test.
- `CHEEKY_OS_STRICT_SCHEMA_CHECK=false` treats schema mismatches as warnings.
- `CHEEKY_OS_ALLOW_PARTIAL_BOOT=true` keeps server booting with partial services.

## 3) Degraded mode behavior
- Endpoints return HTTP 200 with safe envelopes.
- `safeFailureResponse()` emits `safeMessage`, `technicalCode`, and `schemaWarnings`.
- Dashboard remains online with fallback data.

## 4) Future Dataverse fields to add
- TODO SCHEMA: `cr2d1_status` missing in Dataverse — add column when safe.
- TODO SCHEMA: `cr2d1_customer_name` missing in Dataverse — add column when safe.
- TODO SCHEMA: `cr2d1_order_name` missing in Dataverse — verify column name.

## 5) Future Prisma alignment
- Validate all DBs include `Order.mockupUrl`.
- Historical typo note: verify references to `mockupUr1` are removed from runtime code.

## 6) Re-enabling strict self-tests
1. Align Dataverse intake queue columns.
2. Confirm Prisma schema parity in every environment.
3. Set `CHEEKY_OS_BOOT_INTAKE_SELFTEST=true`.
4. Set `CHEEKY_OS_STRICT_SCHEMA_CHECK=true`.
5. Set `CHEEKY_OS_ALLOW_PARTIAL_BOOT=false` only after stable green runs.

## 7) Validate with trust-check endpoint
- Open `GET /api/system/full-status`.
- Confirm:
  - `boot.status` is `ok`
  - `schema.status` is `ok`
  - `degradedMode` is `false`
