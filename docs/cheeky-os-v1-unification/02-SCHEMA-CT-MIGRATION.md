# Schema unification: `crb_*` → `ct_*`

## Recommended target

- **Publisher prefix:** `ct_` (matches `CheekyOsSolution` and `email-intake/dataverse/schemas`).
- **Legacy:** `crb_orders`, `crb_lineitems`, `crb_productionjobs`, `crb_tasks` (from exported flows + `app-definition.json`).

## Field mapping (minimum for gate + tiles)

Map each legacy logical field to `ct_` equivalent (rename in migration tool or create columns on `ct_orderses` / new entities):

| Legacy concept | `ct_` / docs suggestion | Notes |
|----------------|-------------------------|--------|
| Order key | `ct_ordersesid` | Primary key |
| Square invoice id | `ct_squareinvoiceid` (text) | **Correlation** for webhook |
| Deposit paid flag | `ct_depositpaid` (two option) | Set ** only** by automation after Node validation |
| Stage | `ct_orderstage` or `status` choice | Align with Prisma `status` vocabulary |
| Margin % | `ct_marginpercent` (decimal) | For hold branch |
| Intake link | `ct_intakequeueid` (lookup → `ct_intake_queue`) | **Mandatory** for paid transition |

## Migration approaches (pick one)

### A) In-place rename (if same org, unused dependencies)

Use solution layering: add new columns on existing tables, migrate Power Apps bindings, deprecate `crb_*` tables *only* after data migration scripts.

### B) Dual-write period (safest)

1. Node writes Prisma **and** PATCHes both `crb_*` (old) and `ct_*` (new) for **90 days** using mapping service.
2. Switch canvas app galleries to `ct_*`.
3. Decommission `crb_*` tables and PA flows pointing to them.

### C) Virtual entity / Dataflow

Use Dataverse virtual table or Power BI dataflow to expose unified view — **higher complexity**; only if migration blocked.

## C# `DataverseService.cs`

- Replace `crb_orders` query with `ct_orderses` (or final unified name from Prisma sync).
- Regenerate Early Bound or update string literals.

## Power Automate

- Replace every `datasets/default/tables/crb_orders` with `ct_orderses` (verify **set name** — often `ct_orderses` plural).
- Re-bind connections in dev, **Save As** new flow version, test, then swap prod.

## Validation

- `email-intake/dataverse/column-check.js` — extend for `ct_intake_queue` + `ct_audit_event` columns.
- Single script: **count rows** where `ct_depositpaid = true` AND `ct_intakequeueid` null → must be **0** after enforcement.
