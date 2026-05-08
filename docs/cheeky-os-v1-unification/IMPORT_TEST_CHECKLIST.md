# Import / export — solution, connector, testing checklist

> **Full go-live:** use [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md) (re-export, Dataverse, strict gate deploy, adversarial tests, founder alerts).  
> **Founder one-pager:** [`FOUNDER_CHEEKY_OS_V1_LOCKED.md`](./FOUNDER_CHEEKY_OS_V1_LOCKED.md).

## A. Re-export full solution from tenant

1. Sign in to [Power Apps maker](https://make.powerapps.com) → **Solutions**.
2. Open **Cheeky** (or your production solution) → **History** optional snapshot.
3. **Export** → **Unmanaged** (dev) or **Managed** (deploy downstream).
4. Include:
   - All **cloud flows**
   - **Canvas apps** (downloads `.msapp` per app)
   - **Tables** / **custom connectors**
   - **Connection references** (document env vars; secrets not in zip)
5. Store `.zip` in secure repo path: e.g. `artifacts/power-platform/YYYY-MM-DD-cheeky-solution.zip` (optional **Git LFS**).

## B. Custom connector — Anthropic

1. [Power Apps](https://make.powerapps.com) → **Data** → **Custom connectors** → **New** → **OpenAPI 2.0 or OpenAPI 3.0 file**.
2. Upload `connectors/anthropic-messages-v1.openapi.yaml` from this repo.
3. In **General**: set host `api.anthropic.com`, base URL `https://api.anthropic.com`.
4. **Security**: API Key → parameter name `x-api-key`, send in **header**.
5. **Definition** → add fixed request header if UI allows: `anthropic-version` = `2023-06-01` (required by Anthropic). If the wizard lacks it, use **policy template** or wrap with **Azure APIM** in front of Anthropic.
6. **Test** connection with a sandbox key; call `CreateMessage` with small `max_tokens`.
7. Reference connector from **Estimate / Parse** flow.

## C. Import updated tables + flows

1. Create `ct_intake_queue` and `ct_audit_event` in **dev** environment (use schema JSON as field checklist in maker).
2. Add to solution → **Publish all customizations**.
3. Import modified flow JSON only after **rebinding** Dataverse connections to **dev**.
4. **Save As** hardened deposit flow; **do not** overwrite prod until E2E passes.

## D. Node — Single Square webhook

1. Square Developer Dashboard → Webhooks → **single URL** → `https://<your-host>/api/square/webhook` (canonical from `email-intake/cheeky-os/server.js`).
2. **Disable** or delete webhook subscription pointing to **Power Automate** HTTP trigger URL.
3. Implement or extend **Node → Dataverse** PATCH after `depositPaidAt` is set (use existing OAuth app registration from `credential-setup-guide.md`).
4. Log every correlation failure to `ct_audit_event` via HTTP action or SDK.

## E. End-to-end test (happy path)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Power Apps: **New Order** → creates `ct_intake_queue` INTAKE_NEW | Row visible in queue view |
| 2 | Flow: Claude parse → fills quote JSON → status QUOTE_PENDING | Parsed fields populated |
| 3 | Flow/API: create Square invoice, store `ct_square_invoice_id`, status INVOICE_SENT | Invoice id non-null |
| 4 | Customer pays deposit in Square | Webhook hits **Node only** |
| 5 | Node | Prisma `depositPaidAt` set; Dataverse intake `ct_deposit_paid`; status GATE_PASSED |
| 6 | Production | Job / blanks flow runs **once** | No duplicate jobs |
| 7 | Tiles | Counts match funded filters | Estimates ↓ funded ↑ |

## F. Bypass / abuse tests (must fail safely)

| # | Attempt | Expected |
|---|---------|----------|
| B1 | Direct PATCH `ct_deposit_paid = true` in maker | **Blocked** (plugin) or **audit** + alert + reverted next sync |
| B2 | Square payment on invoice **not** linked to intake | **No** production row; **CORRELATION_FAIL** audit |
| B3 | Replay same Square `event_id` | **Idempotent** — second delivery no duplicate jobs |
| B4 | Power Automate old URL still subscribed | **No traffic** or 410 — verify dashboard |
| B5 | Create `ct_orderses` manually as Production Ready | **Does not** pass blanks gate if `ct_deposit_paid` false on linked intake |
| B6 | Margin below threshold | **Margin hold**; no production job; founder notified |
| B7 | founder API PATCH bypass Node | Documented **break-glass** only via **override** flow that **must** write `ct_audit_event` OVERRIDE |

## G. Sign-off

- [ ] Single webhook endpoint live  
- [ ] No PA flow creates deposit-paid order without intake  
- [ ] `ct_*` exclusive in app (or dual-write retired)  
- [ ] Audit table receiving events  
- [ ] Tiles bound to views in `POWER_FX_TILES.md`  

---

**Note:** Model IDs (`claude-sonnet-4-*`) change; update connector examples when Anthropic publishes new IDs.
