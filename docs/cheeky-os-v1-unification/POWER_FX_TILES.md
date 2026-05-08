# Power Fx and views — unified tiles (Dataverse `ct_*`)

## Rules

1. Every **count** tile must filter on **`ct_deposit_paid`**, **`ct_status`**, and **`ct_margin_hold`** consistently.
2. Do **not** use `crb_*` columns in new formulas.
3. Prefer **Dataverse views** as the data source for galleries (performance + one definition).

## Suggested views (create in maker)

| View name | Filter | Use on tile |
|-----------|--------|-------------|
| `VW_Intake_Open` | `ct_status in (INTAKE_NEW, PARSED, QUOTE_PENDING)` | New / triage |
| `VW_Estimates_Out` | `QUOTE_PENDING or INVOICE_SENT` AND `ct_deposit_paid = false` | Estimates (4) style |
| `VW_Waiting_Deposit` | `INVOICE_SENT or DEPOSIT_PENDING` AND `ct_deposit_paid = false` | Pay me |
| `VW_Funded_Production` | `ct_deposit_paid = true` AND `ct_margin_hold = false` AND `ct_status = GATE_PASSED` | Production / blanks |
| `VW_Margin_Hold` | `ct_margin_hold = true` | Owner queue |
| `VW_Audit_Critical` | `ct_audit_event` where `ct_severity in (HIGH, CRITICAL)` last 7 days | Admin alert |

## Count on a label (rollup pattern)

```powerfx
CountRows(
  Filter(
    'Intake Queues', // ct_intake_queues logical name in your env
    ct_status = "INVOICE_SENT" And ct_deposit_paid = false
  )
)
```

Replace `'Intake Queues'` with your **display name** as Power Apps resolves it.

## Funded + linked to Prisma (mirror confirmation)

```powerfx
If(
  ThisItem.ct_deposit_paid && !IsBlank(ThisItem.ct_prisma_order_id),
  "Funded · Ref " & ThisItem.ct_prisma_order_id,
  If(
    ThisItem.ct_deposit_paid,
    "Funded (sync pending)",
    "Awaiting deposit"
  )
)
```

## Quotes waiting on AI (QUOTE_PENDING without parsed JSON)

If you store parsed output in `ct_parsed_json`:

```powerfx
CountRows(
  Filter(
    'Intake Queues',
    ct_status = "QUOTE_PENDING" && IsBlank(ct_parsed_json)
  )
)
```

*(If `ct_parsed_json` is optional/multiline, use `Len(Trim(ct_parsed_json)) = 0` or an “AI complete” boolean your flow sets.)*

## Gates passed (tile)

```powerfx
CountRows(
  Filter(
    'Intake Queues',
    ct_status = "GATE_PASSED" && ct_deposit_paid
  )
)
```

## Block manual shortcut (UX — not security alone)

On **Save** of `ct_orderses` form:

```powerfx
If(
  DataCardValueDepositPaid.Value = true And IsBlank(LookUp('Intake Queues', ct_intake_queueid = ThisItem.ct_intakequeueid, ct_intake_queueid)),
  Notify("Deposit must be confirmed via Square gate — cannot mark paid here.", NotificationType.Error); 
  false,
  true
)
```

Use **Edit form** `OnSuccess` guard or **prevent** editing `ct_deposit_paid` on form (hide card for all except admin role).

## Security role

- Remove **write** on `ct_deposit_paid`, `ct_status` (gate fields) from **Founder** personal role if you want **role-based** lock — **only** service principal / flow user retains write. (Test in sandbox first.)

---

## Printavo-style KPIs (bottlenecks & margin)

After extending intake with **`ct_production_stage_code`**, **`ct_proof_status`**, **`ct_quoted_subtotal`**, **`ct_estimated_job_cost`**, **`ct_bottleneck_reason`**:

**Proof stuck (funded, proof sent, no approval in 4+ days):**

```powerfx
CountRows(
  Filter(
    'Intake Queues',
    ct_deposit_paid
      And ct_status = "GATE_PASSED"
      And ct_proof_status = "SENT"
      And DateDiff(ct_proof_sent_at, Now(), TimeUnit.Days) >= 4
  )
)
```

**Rough margin signal (non-blank estimates only):**

```powerfx
CountRows(
  Filter(
    'Intake Queues',
    ct_deposit_paid
      And !IsBlank(ct_quoted_subtotal)
      And !IsBlank(ct_estimated_job_cost)
      And ct_quoted_subtotal - ct_estimated_job_cost < Value("100")
  )
)
```

Tune thresholds per shop. See **`PRINTAVO_STYLE_LAYER.md`** and **`POWER_FX_PRODUCTION_BOARD.md`**.
