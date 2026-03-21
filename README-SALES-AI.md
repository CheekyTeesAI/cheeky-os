# Cheeky Sales AI

Sales operations layer for CheekyTees print shop.

## Module

`sales-assistant.ps1` - Quotes, invoices, customer history, payment tracking.

## Functions

| Function | Purpose |
|---|---|
| `New-CheekyQuoteFromRequest` | Create a quote with customer, product, quantity, pricing |
| `Create-CheekyInvoiceFromOrder` | Create a Square invoice from a Dataverse order |
| `Send-CheekyInvoice` | Publish/send a Square invoice to customer |
| `Get-CustomerHistory` | Show all orders for a customer name |
| `Get-UnpaidInvoices` | List unpaid invoices (Square or Dataverse fallback) |
| `Send-PaymentReminder` | Re-publish an unpaid invoice as a reminder |
| `Set-OrderComplete` | Mark order + production task as Completed |
| `Set-OrderReady` | Mark order + production task as Ready for Pickup |

## CLI Commands

```
cheeky quote create         Create a new quote interactively
cheeky invoice create       Create a Square invoice
cheeky invoice send         Send a Square invoice
cheeky customer history     Show order history for a customer
cheeky unpaid               Show unpaid invoices
cheeky reminder             Send payment reminder
cheeky order-complete       Mark order completed
cheeky order-ready          Mark order ready for pickup
```

## Natural Language (via copilot)

```
send invoice to new customer
send invoice to customer
create quote
show customer history
who hasn't paid
send payment reminder
mark order complete
mark order ready for pickup
```

## Data Flow

```
Quote Request -> quotes.json (local store)
Invoice Create -> Square API -> Dataverse sync
Payment Check -> Square Invoices API or Dataverse fallback
Customer History -> Dataverse CheekyOrders by customer name
```

## Configuration

- `square-config.json` - Square API credentials (required for invoice/payment features)
- If Square is not configured, functions log warnings and degrade gracefully

## Local Storage

- `quotes.json` - Quote records persisted locally
- `logs/sales.log` - Sales operation logs
- `business-audit.jsonl` - Audit trail for all sales actions
