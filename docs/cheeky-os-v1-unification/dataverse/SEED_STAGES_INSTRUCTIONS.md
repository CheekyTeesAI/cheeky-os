# Seed `ct_stage_definition` (Phase A)

## Option A — Manual (sandbox first)

1. **powerapps.microsoft.com** → **Tables** → open **Production Stage** (`ct_stage_definition`).
2. For each row in **`seed_ct_stage_definition.json`** → **+ New row**.
3. Fill: **Stage Code** (`ct_code`), **Board Label**, **Sort Order**, **Kanban Column Index**, **Accent Color** (`ct_color_hex`), **Visible After Gate**, **Is Terminal Stage**.
4. **Save** each row, then **Publish** customizations.

## Option B — Excel / CSV import

1. From repo **`email-intake/`** run **`npm run seed:stages:csv`** (generates / updates **`seed_ct_stage_definition.csv`**).
2. **Tables** → **Production Stage** → **Import data** → upload **`seed_ct_stage_definition.csv`** (map columns to logical names).

## Option C — Dataverse Web API (automation)

Use the same field values as **`seed_ct_stage_definition.json`** with `POST /api/data/v9.2/ct_stage_definitions` (service principal). Prefer Option A until option-set / choice columns are aligned with your environment.

## Alignment with Node

After **deposit mirror**, **`productionKickoff.service.js`** sets **`ct_production_stage_code`** on the intake row to **`DEPOSIT_PAID`** by default (override with **`CHEEKY_CT_INITIAL_PRODUCTION_STAGE`**). Seed a stage row whose **`ct_code`** matches.

## Verification

- [ ] Eight rows exist (seven production + optional `QUOTE_SENT`).
- [ ] **`ct_code`** values are **UPPER_SNAKE** and match Power Fx filters.
- [ ] Production Board gallery uses **`ct_visible_after_gate = true`** or excludes `QUOTE_SENT` via funded-only filter.
