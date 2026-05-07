# Cheeky OS - Business Operating System

Complete AI-driven business automation for CheekyTees print shop.

## Architecture

```
                    Square API                     Email Inbox
                        |                               |
                        v                               v
              SquareWebhookFunction         EmailIntakeFlow (Power Automate)
              SquareInvoicePaidFlow              email-intake-agent.ps1
                        |                               |
                        v                               v
                 +------ Dataverse (crb_ tables) ------+
                 |                                      |
    Orders -> ProductionRoutingEngine -> ProductionJobs -> Tasks
                 |                           |
          MarginGate (45%)          ProductionTracker
                 |                           |
          business-rules.ps1        ProgressTracker
```

## Data Model (Locked)

| Table | Logical Name | Purpose |
|-------|-------------|---------|
| Orders | crb_orders | Central order records |
| Line Items | crb_lineitems | Individual items per order |
| Production Jobs | crb_productionjobs | Print jobs generated from orders |
| Tasks | crb_tasks | Art Prep, Garment Order, Printing, QC, Notify |
| Customers | crb_customers | Customer records |
| Products | crb_products | Product catalog with material routing |
| Vendors | crb_vendors | External vendor records |
| Subcontract Jobs | crb_subcontractjobs | Jobs sent to vendors |
| Progress Tracker | crb_progresstracker | Audit trail of status changes |

Run `cheeky schema show` to see full column definitions.

## Order Stage Engine

```
Intake -> Quote Sent -> Deposit Paid -> Production Ready -> Printing -> Completed
```

## Production Board

```
Production Ready -> Printing -> QC -> Ready for Pickup
```

## Production Type Routing

| Material | Route |
|----------|-------|
| 100% Polyester | DTF |
| 50/50 Blend | DTF (preferred) or DTG |
| Triblend | DTG |
| 100% Cotton (qty >= 24) | Screen Print |
| 100% Cotton (qty < 24) | DTG |
| Short deadline (< 3 days) | In-house only |
| Large order (100+) | Vendor eligible |

Run `cheeky route` to check routing interactively.

## Minimums

| Type | Minimum |
|------|---------|
| DTG | 12 pieces |
| DTF | 12 pieces |
| Embroidery | 12 pieces |
| Screen Print | 24 pieces |

## Margin Gate

**Minimum margin: 45%**

If margin < 45%:
- Order is flagged
- Production task creation is blocked
- Alert sent to owner

Run `cheeky margin` to check interactively.

## Power Automate Flows

| Flow | Trigger | Action |
|------|---------|--------|
| Email Intake Flow | New email at orders@cheekyteesllc.com | Parse, create customer, create order (stage=Intake) |
| Square Estimate Conversion | HTTP webhook | Match/create customer from Square, create order |
| Square Invoice Paid Flow | HTTP webhook | Check payment, margin gate, advance to Production Ready |
| Production Routing Engine | Order stage = Production Ready | Create production job + 5 tasks, enforce margin |
| Cheeky Task Generator | New order row | Create standard task set (Order Blanks, Prep Art, Print, QC, Notify) |
| Cheeky Production Tracker | Task completed | Log progress, advance next task or complete order |

## Azure Functions (C#)

| Function | Endpoint | Purpose |
|----------|----------|---------|
| send_invoice | POST /api/send_invoice | Invoice endpoint stub |
| get_order_status | GET /api/get_order_status?customer_email= | Query orders by email |
| test_dataverse_connection | GET /api/test_dataverse_connection | Health check |
| square_webhook | POST /api/square_webhook | Receive Square webhook events |
| margin_gate | POST /api/margin_gate | Validate margin meets 45% |
| advance_order_stage | POST /api/advance_order_stage | Advance order through stages |
| get_order_stages | GET /api/get_order_stages | List valid stages and types |

## CLI Commands

### Cheeky OS

```
cheeky schema show        Show full data model
cheeky schema validate    Check Dataverse tables exist
cheeky route              Production type routing check
cheeky margin             Margin gate (45%) check
cheeky validate           Full order validation (min + margin)
```

### Business Operations

```
cheeky ask "what jobs are due tomorrow"
cheeky ask "send invoice to new customer"
cheeky ask "who has not paid"
cheeky orders today
cheeky production today
cheeky sync square
cheeky email-scan
```

## PowerShell Modules

| Module | Purpose |
|--------|---------|
| dataverse-schema.ps1 | Schema definition, validation, display |
| business-rules.ps1 | Routing, minimums, margin gate, stage engine |
| orders-engine.ps1 | Dataverse CRUD for orders |
| production-manager.ps1 | Task generation and scheduling |
| sales-assistant.ps1 | Quotes, invoices, customer history |
| square-api.ps1 | Square REST API integration |
| email-intake-agent.ps1 | Email scanning and order creation |
| dispatcher.ps1 | Natural language command router |
| cheeky-orchestrator.ps1 | Master CLI orchestrator |

## Configuration Required

| Config | File | Status |
|--------|------|--------|
| Dataverse connection | CheekyAPI/local.settings.json | Configured |
| ENV_URL | Environment variable | Configured |
| PAC auth | pac auth create | Configured |
| Square credentials | square-config.json | Awaiting credentials |
| Email IMAP | email-config.json | Awaiting credentials |

## Cheeky OS HTTP (email-intake) — snapshot 2026-04-14

The Node/Express app in `email-intake/cheeky-os/server.js` is the operational API + static staff UI. Recent additions include **customer reply capture** (`/api/comms/replies`, intake branches), **work order packets** (`/api/work-orders/*`, printable HTML under `/work-orders/:orderId/print`), and **quote intelligence** (`POST /api/quotes/calculate`). After TypeScript changes, run `npm run build` in `email-intake` so `dist/` matches `src/`.

**End-of-day log:** see `control/history/2026-04-14-eod-cheeky-os.md` for routes, status, gaps, and next steps.

## Current Status

- Main server entrypoint: `email-intake/cheeky-os/server.js` (`npm start` from `email-intake`).
- **v4.3 Production Ready** — Power Apps: import `docs/cheeky-os-power-apps-connector.openapi.yaml`, bind `GET /api/cheeky-os/dashboard-data` → `tiles.*` including `HealthSummary`; see `docs/power-apps-dashboard-integration-playbook.md`.
- **One-shot local verify** (from `email-intake`, with server up): `npm run test:dashboard` and `curl -s http://127.0.0.1:3000/health`.
- Dashboard URL: `http://127.0.0.1:3000/dashboard.html`.
- Key routes:
  - `POST /api/operator/run`
  - `POST /api/ai/execute`
  - `GET /api/production/queue`
  - `GET /api/reports/run?period=today|week`
  - `GET /api/reports/customer?email=...`
  - `GET /api/sales/call-list`, `POST /api/sales/log`
  - `GET /api/memory/insights`, `GET /api/memory/kaizen`
- Command examples:
  - `daily report`
  - `weekly report`
  - `outstanding invoices`
  - `call list`
  - `kaizen`
  - `write follow-up`
