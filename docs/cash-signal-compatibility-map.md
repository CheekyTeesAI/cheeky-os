# Cash Signal Compatibility Map

Generated for CASHFLOW + RUNWAY INTELLIGENCE v1.0.

## Inflows

- deposits expected (`Order.status=DEPOSIT_PENDING`, `amountTotal-amountPaid`): **ACTUAL** (internal order truth, can lag payment rail)
- outstanding quotes (`Order.status` includes `QUOTE`): **ESTIMATED** (status heuristic)
- outstanding invoices (`Order.status` includes `INVOICE` or post-deposit stages): **ESTIMATED** (status heuristic)
- payment activity today (`Order.amountPaid` on orders updated today): **ACTUAL**
- payment activity last 7 days (`Order.amountPaid` on orders updated in last 7 days): **ACTUAL**

## Outflows

- known bills/obligations (`data/known-obligations.json`, operator-maintained): **ESTIMATED**
- vendor commitments (release tasks not ready used as exposure proxy): **ESTIMATED**
- payroll estimates (obligation type `payroll`): **ESTIMATED**
- tax obligations (obligation type `tax`): **ESTIMATED**
- loan obligations (obligation type `loan`): **ESTIMATED** when present, otherwise **UNKNOWN**

## Liquidity

- current cash on hand: **UNKNOWN** (no authoritative bank ledger in current system)
- current bank proxy: **ESTIMATED** (`paidLast7Days / 2` fallback proxy)
- safe fallback when unavailable: **UNKNOWN**

## Notes

- No direct bank integration detected.
- No auto payment execution routes are used by this phase.
- Seed obligations are explicitly operator-maintained and non-authoritative.
