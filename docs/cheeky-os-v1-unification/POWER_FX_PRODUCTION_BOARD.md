# Production Board — Canvas app (Printavo-style, funded-only)

**Cash control:** Cards may appear only when **`ct_deposit_paid = true`** AND **`ct_status = "GATE_PASSED"`** (same as **`GATE_PASSED`** queue status after Node mirror). Do **not** relax this filter on the production floor.

Replace table **display names** below (`'Intake Queues'`, `'Production Stages'`) with what appears in your **Data** pane.

---

## Embed on an existing dashboard (home screen)

1. On the **main ops** screen, insert a **Container** **`conProductionBoardShell`** below your KPI tiles.
2. Inside it, add **Horizontal gallery** **`galBoardColumns`** with the same **`Items`** / nested card **`Filter`** as **`galColumns`** / **`galCards`** (see layout below). Set **`DelayedLoad`** = `true` on the inner gallery if row counts are large.
3. Title label: **"Production (funded only)"** — reinforces that this is **post-webhook / GATE_PASSED** work.
4. **Never** remove **`ct_deposit_paid And ct_status = "GATE_PASSED"`** from card filters to show unfunded work on this surface.

---

## Screen layout (recommended)

| Control | Name | Purpose |
|---------|------|---------|
| Screen | `scrProductionBoard` | Main ops board |
| Horizontal gallery | `galColumns` | One column per **`ct_stage_definition`** row |
| Vertical gallery inside | `galCards` | Intake cards for **`ThisItem.ct_code`** |
| Rectangle | `rectColumnHeader` | Strip filled with **`ThisItem.ct_color_hex`** |
| Label | `lblColumnTitle` | **`ThisItem.ct_label`** |
| Button/icon | `btnRefresh` | `Refresh('Intake Queues'); Refresh('Production Stages')` |

Optional: **Screen** `scrJobDetail` — navigate on card tap; show tasks (`ct_production_task`) and proof assets.

---

## `scrProductionBoard.OnVisible`

Loads ordered stages (only those meant for the funded board):

```powerfx
ClearCollect(
  colStages,
  SortByColumns(
    Filter(
      'Production Stages',
      ct_visible_after_gate
    ),
    "ct_sort_order",
    SortOrder.Ascending
  )
);
Set(varCalendarDays, 30);
```

---

## `galColumns` (horizontal)

- **Items:** `colStages`
- **Template width:** `Parent.Width / Max(CountRows(colStages), 1)` or fixed ~280  
- **Template padding:** 8  

**`rectColumnHeader.Fill`** (inside column template):

```powerfx
If(
  IsBlank(ThisItem.ct_color_hex),
  Color.DarkGray,
  RGBA(
    Value(Mid(ThisItem.ct_color_hex, 2, 2), 16),
    Value(Mid(ThisItem.ct_color_hex, 4, 2), 16),
    Value(Mid(ThisItem.ct_color_hex, 6, 2), 16),
    1
  )
)
```

**`lblColumnTitle.Text`:** `ThisItem.ct_label`

---

## `galCards` (nested inside column template)

**Items:**

```powerfx
SortByColumns(
  Filter(
    'Intake Queues',
    ct_deposit_paid
      And ct_status = "GATE_PASSED"
      And ct_margin_hold = false
      And ct_production_stage_code = galColumns.Selected.ct_code
  ),
  "ct_name",
  SortOrder.Ascending
)
```

If nested gallery cannot use **`galColumns.Selected`**, use **`ThisItem.ct_code`** from parent column context (in nested gallery, parent column is still **`ThisItem`** of outer — in Power Apps, set **`galCards.Items`** to:

```powerfx
SortByColumns(
  Filter(
    'Intake Queues',
    ct_deposit_paid
      And ct_status = "GATE_PASSED"
      And ct_margin_hold = false
      And ct_production_stage_code = ThisItem.ct_code
  ),
  "ct_name",
  SortOrder.Ascending
)
```

(Here **`ThisItem`** = current **column** row.)

---

## Card template (inside `galCards`)

| Control | Binding |
|---------|---------|
| `lblCustomer` | `ThisItem.ct_customer_name` |
| `lblJob` | `ThisItem.ct_name` |
| `lblProofBadge` | see **Proof badge** below |
| `lblDue` | `Text(ThisItem.ct_target_ship_date, DateTimeFormat.ShortDate)` if not blank |

**Card left border:** narrow **`Rectangle`** with **`Fill`** = parent stage color — use **`LookUp(colStages, ct_code = ThisItem.ct_production_stage_code, ct_color_hex)`** and same **`RGBA`** pattern.

---

## `galCards.OnSelect` — open job detail

```powerfx
Set(varSelectedIntakeId, ThisItem.ct_intake_queueid);
Navigate(scrJobDetail, ScreenTransition.Fade);
```

---

## `scrJobDetail.OnVisible`

```powerfx
Set(varTasks, Filter('Production Tasks', ct_intake_queueid = varSelectedIntakeId));
Set(varProofs, Filter('Proof Assets', ct_intake_queueid = varSelectedIntakeId));
```

**Task gallery Items:** `SortByColumns(varTasks, "ct_sort_order", SortOrder.Ascending)`

**Proof gallery Items:** `SortByColumns(varProofs, "ct_round_number", SortOrder.Descending)`

---

## Proof badge (on card)

```powerfx
Switch(
  ThisItem.ct_proof_status,
  "APPROVED", "Proof OK",
  "SENT", "Awaiting proof",
  "REJECTED", "Proof rejected",
  "REVISION", "Revision",
  "NOT_SENT", "Proof pending",
  "NOT_REQUIRED", "",
  ""
)
```

---

## Move card to another stage (drag alternative: drop buttons)

**Stage picker** on detail screen **`ddlNextStage`:**

- **Items:** `colStages`
- **Value:** `ct_label`

**Button `btnMoveStage.OnSelect`:**

```powerfx
Patch(
  'Intake Queues',
  LookUp('Intake Queues', ct_intake_queueid = varSelectedIntakeId),
  { ct_production_stage_code: ddlNextStage.Selected.ct_code }
);
Back()
```

**Security:** only **Shop** role may **Patch** **`ct_production_stage_code`** — not **`ct_deposit_paid`** / **`ct_status`**.

---

## Calendar companion screen (optional)

**Gallery Items:**

```powerfx
SortByColumns(
  Filter(
    'Intake Queues',
    ct_deposit_paid
      And ct_status = "GATE_PASSED"
      And !IsBlank(ct_target_ship_date)
      And ct_target_ship_date >= Today()
      And ct_target_ship_date <= DateAdd(Today(), varCalendarDays, TimeUnit.Days)
  ),
  "ct_target_ship_date",
  SortOrder.Ascending
)
```

---

## Tile: funded WIP count

```powerfx
CountRows(
  Filter(
    'Intake Queues',
    ct_deposit_paid
      And ct_status = "GATE_PASSED"
      And ct_margin_hold = false
      And Not(ct_production_stage_code in ["COMPLETE", "CANCELED"])
  )
)
```

(Adjust **COMPLETE** to match your **`ct_code`** for done column.)

---

## Node integration (Phase A)

After **`mirrorDepositToDataverse`**:

- **`productionKickoff.service.js`** runs **`ensureJobShellForDepositedOrder`** + **`generateTasksForOrder`**.
- Sets **`ct_production_stage_code`** to **`DEPOSIT_PAID`** (or **`CHEEKY_CT_INITIAL_PRODUCTION_STAGE`**).
- Optional **`CHEEKY_CT_MIRROR_TASKS_TO_DV=true`** creates **`ct_production_task`** rows (requires table + choice values aligned).

---

See **`POWER_FX_TILES.md`**, **`PRINTAVO_STYLE_LAYER.md`**, **`dataverse/SEED_STAGES_INSTRUCTIONS.md`**.
