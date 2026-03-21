# CheekyTees Business AI System

## Overview

Integrated business operations system combining Square financial processing, Dataverse order management, and the Cheeky deployment CLI.

## Configuration

### Square credentials (required)

Edit `square-config.json`:

```json
{
  "squareAccessToken": "YOUR_SQUARE_ACCESS_TOKEN",
  "locationId": "YOUR_SQUARE_LOCATION_ID",
  "environment": "production"
}
```

Get these from https://developer.squareup.com/apps

### Dataverse (already configured)

ENV_URL environment variable must be set. The deployment CLI handles this automatically.

### Dataverse Table: CheekyOrders

The orders engine expects a table with logical name `cr4b4_cheekyorders` and these columns:

| Column | Logical Name | Type |
|--------|-------------|------|
| CustomerName | cr4b4_customername | Text |
| CustomerEmail | cr4b4_customeremail | Text |
| InvoiceID | cr4b4_invoiceid | Text |
| Product | cr4b4_product | Text |
| Quantity | cr4b4_quantity | Number |
| PrintType | cr4b4_printtype | Text |
| DueDate | cr4b4_duedate | Date |
| Status | cr4b4_status | Text |
| Notes | cr4b4_notes | Text |
| CreatedDate | cr4b4_createddate | DateTime |

Valid statuses: Intake, Awaiting Payment, Production Ready, Printing, QC, Ready for Pickup, Completed

## CLI Commands

### DevOps

| Command | Description |
|---------|-------------|
| `cheeky deploy` | Full deployment pipeline |
| `cheeky doctor` | Health check |
| `cheeky fix` | Auto-repair issues |
| `cheeky rebuild` | Delete + re-export + redeploy |
| `cheeky autopilot` | Full auto: doctor, fix, deploy |
| `cheeky classify-error` | Analyze logs for known errors |
| `cheeky logs` | Open logs folder |

### Business

| Command | Description |
|---------|-------------|
| `cheeky orders today` | Show orders due today |
| `cheeky orders tomorrow` | Show orders due tomorrow |
| `cheeky invoice create` | Create a Square invoice |
| `cheeky invoice send` | Send a Square invoice |
| `cheeky customer lookup` | Look up a Square customer |
| `cheeky payments today` | List payments received today |
| `cheeky copilot` | Natural language command mode |

### Copilot Natural Language

Say things like:
- "send invoice to customer"
- "show jobs due tomorrow"
- "did customer pay invoice"
- "create order from payment"

## Square Webhook Processing

`square-webhook-agent.ps1` processes Square events:

| Event | Action |
|-------|--------|
| invoice.created | Creates CheekyOrders record with status "Awaiting Payment" |
| invoice.paid | Updates order to "Production Ready", generates production tasks |
| order.created | Creates CheekyOrders from line item data |
| payment.updated | Updates PaymentID, promotes to Production Ready if COMPLETED |

Duplicate events are automatically skipped via `logs/processed-events.log`.

Usage: `.\square-webhook-agent.ps1 -EventPayloadPath event.json`

## Email Intake

`email-intake-agent.ps1` scans for customer emails and converts them to orders.

- Supports local JSON files in `emails-inbox/` for testing
- IMAP support via MailKit (place `MailKit.dll` in `lib/`)
- Parses customer intent: product, quantity, color, print type, due date
- Creates CheekyOrders records automatically
- Duplicate prevention via `logs/processed-emails.log`
- Configure in `email-config.json`

## Sales Assistant

`sales-assistant.ps1` handles quotes, invoices, and customer management.

| Function | Purpose |
|----------|---------|
| New-CheekyQuoteFromRequest | Create a quote with pricing |
| Create-CheekyInvoiceFromOrder | Create Square invoice from order |
| Send-CheekyInvoice | Send invoice to customer |
| Get-CustomerHistory | All orders for a customer |
| Get-UnpaidInvoices | Unpaid invoices (Square or Dataverse) |
| Send-PaymentReminder | Re-send invoice as reminder |
| Set-OrderComplete | Mark order completed |
| Set-OrderReady | Mark order ready for pickup |

## Log Files

| Log | Purpose |
|-----|---------|
| logs/square-api.log | Square API calls |
| logs/square-webhooks.log | Webhook event processing |
| logs/orders.log | Dataverse order operations |
| logs/production.log | Production task operations |
| logs/email-intake.log | Email scanning and parsing |
| logs/sales.log | Sales operations |
| logs/cheeky-commands.log | Copilot command translations |
| logs/latest.log | Most recent orchestrator run |
| logs/orchestrator-*.log | Timestamped orchestrator logs |

## Audit Trail

`business-audit.jsonl` records every business action:

```json
{"timestamp":"...","command":"order-complete","module":"sales","result":"success","notes":"..."}
```

## CLI Commands

### DevOps

| Command | Description |
|---------|-------------|
| `cheeky deploy` | Full deployment pipeline |
| `cheeky doctor` | Health check |
| `cheeky fix` | Auto-repair issues |
| `cheeky rebuild` | Delete + re-export + redeploy |
| `cheeky autopilot` | Full auto: doctor, fix, deploy |
| `cheeky classify-error` | Analyze logs for known errors |
| `cheeky logs` | Open logs folder |

### Business

| Command | Description |
|---------|-------------|
| `cheeky sync square` | Pull Square data into Dataverse |
| `cheeky orders today` | Show orders due today |
| `cheeky orders tomorrow` | Show orders due tomorrow |
| `cheeky orders production` | Show orders in production pipeline |
| `cheeky invoice create` | Create a Square invoice |
| `cheeky invoice send` | Send a Square invoice |
| `cheeky customer lookup` | Look up a Square customer |
| `cheeky customer history` | Show order history for a customer |
| `cheeky payments today` | List payments received today |
| `cheeky copilot` | Natural language command mode |

### Sales

| Command | Description |
|---------|-------------|
| `cheeky quote create` | Create a new quote |
| `cheeky unpaid` | Show unpaid invoices |
| `cheeky reminder` | Send payment reminder |
| `cheeky order-complete` | Mark order completed |
| `cheeky order-ready` | Mark order ready for pickup |

### Production

| Command | Description |
|---------|-------------|
| `cheeky production today` | Print schedule for today |
| `cheeky production tomorrow` | Print schedule for tomorrow |
| `cheeky production summary` | Totals by print type and status |
| `cheeky task create` | Generate tasks from ready orders |
| `cheeky task update` | Change a task status |

### Email

| Command | Description |
|---------|-------------|
| `cheeky email-scan` | Scan inbox for order emails |

### Copilot Natural Language

Say things like:
- "send invoice to new customer"
- "show jobs due tomorrow"
- "did customer pay yet"
- "create order from Square payment"
- "show customer history"
- "who hasn't paid"
- "create quote"
- "create quote from email"
- "mark order ready for pickup"
- "scan inbox"

## Files

| File | Purpose |
|------|---------|
| square-config.json | Square API credentials |
| email-config.json | Email IMAP configuration |
| square-api.ps1 | Square REST API module |
| orders-engine.ps1 | Dataverse order CRUD |
| production-manager.ps1 | Production task engine |
| sales-assistant.ps1 | Sales operations layer |
| email-intake-agent.ps1 | Email order intake agent |
| square-webhook-agent.ps1 | Webhook event processor |
| copilot-commands.ps1 | Natural language translator |
| copilot-agent.ps1 | Self-healing deployment agent |
| cheeky-orchestrator.ps1 | Master orchestrator |
| cheeky.cmd | CLI launcher |
| error-map.json | Error classification patterns |
| deployment-config.json | Deployment configuration |
| production-tasks.json | Local production task store |
| quotes.json | Local quote store |
| business-audit.jsonl | Business action audit trail |
