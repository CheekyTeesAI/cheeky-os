# Power Automate — `ct_audit_event` high-severity alert

## Purpose

Notify the founder when someone or something attempts to **bypass the deposit gate** or triggers **correlation failure**, **override**, or **margin hold** escalation.

## Node — immediate webhook (additive)

When the Square webhook **fails** the strict intake gate, `ctSync.service.js` calls **`CHEEKY_FOUNDER_ALERT_WEBHOOK_URL`** (POST JSON) after attempting `ct_audit_event`. Use a **Teams Incoming Webhook** URL or your own receiver.

- Teams URLs typically contain `office.com/webhook` — Node sends `{ "text": "…" }`.
- Other URLs receive `{ title, detail, code, invoiceId, source, ts }`.

**Dataverse remains the audit log of record**; this URL is for **fast** paging. Keep the Power Automate flow below for CRM-driven alerts and history.

## Trigger (recommended — Dataverse)

**Microsoft Dataverse — When a row is added, modified or deleted**

- Table: `ct_audit_events` (verify plural set name in your environment).
- Change type: **Added** (and optionally **Modified** if you update severity later).
- Scope: **Organization**.

## Condition

```text
ct_severity is equal to HIGH
OR ct_severity is equal to CRITICAL
```

(Optional) Exclude noisy test users: `ct_actor` does equal `system:test`.

## Actions

1. **Post message in a chat or channel** (Microsoft Teams) — include:
   - `ct_name`
   - `ct_event_type`
   - `ct_message` (truncate if long)
   - Link to maker row: concatenate environment URL + `&pagetype=entityrecord&etn=ct_audit_event&id=` + `ct_audit_eventid`.

2. **Send an email (V2)** — To founder distribution list; same body; attach **redacted** `ct_payload_json` only if size &lt; 100 KB.

3. **Optional — same flow**: If `ct_event_type` equals `CORRELATION_FAIL`, start **approval** (only if you want human ack; do not use approval as the gate substitute).

## Companion: detect manual field tampering

Create a **second** flow: **When a row is modified** on `ct_intake_queues` or `ct_orderses`.

- Trigger filters (if available): columns `ct_depositpaid`, `ct_orderstage`, `ct_status`.

**Condition:** Row modified by **user** (not application user / service principal).

- In Power Automate, use `ModifyingUser` / `VersionNumber` pattern, or compare **Owning user** to known integration account; exact expression depends on your trigger payload — test in dev.

**Actions:**

1. Create **new** `ct_audit_event`:
   - `ct_event_type`: `MANUAL_EDIT`
   - `ct_severity`: `HIGH` (or `CRITICAL` if deposit flag flipped to true)
   - `ct_message`: concatenation of table name + record id + changed fields if captured.

2. The first flow above will then alert.

## Service principal writes

Ensure flows that **apply** the real gate use a **dedicated application user** (SPN). That user should **not** appear as “manual edit” in the tampering flow, or whitelist `Azure AD Application ID` in a condition.

## Testing

- In dev: `POST` a row to `ct_audit_event` with `ct_severity = CRITICAL` → Teams + email received within 1 minute.
- Modify intake `ct_deposit_paid` in UI with a test user → tampering flow fires.
