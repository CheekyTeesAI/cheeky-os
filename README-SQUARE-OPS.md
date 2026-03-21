# Cheeky Square Operations Bridge

Connects Square financial activity to the CheekyTees Dataverse operational system and production pipeline.

When Square events happen (invoices, orders, payments), the system automatically creates or updates Dataverse records so Copilot can answer real business questions.

---

## Architecture

```
Square (financial source) --> Webhooks / Sync --> Dataverse CheekyOrders (operational truth)
                                                        |
                                                        v
                                               ProductionTasks (local store)
                                                        |
                                                        v
                                               Daily Print Schedule
```

---

## Square Integration

### Configuration

Edit `square-config.json`:

```json
{
  "squareAccessToken": "YOUR_ACCESS_TOKEN",
  "locationId": "YOUR_LOCATION_ID",
  "environment": "production",
  "webhookSignatureKey": "YOUR_WEBHOOK_KEY"
}
```

### Supported Square Events

| Event             | Action                                                      |
|-------------------|-------------------------------------------------------------|
| invoice.created   | Creates CheekyOrder with Status = Awaiting Payment          |
| invoice.paid      | Updates order to Production Ready, generates production tasks|
| order.created     | Creates CheekyOrder with line item data from Square          |
| payment.updated   | Updates PaymentID; promotes to Production Ready if COMPLETED |

### Sync Command

`cheeky sync square` pulls recent invoices, orders, and payments from Square and creates or updates Dataverse records. This is the manual equivalent of what webhooks do automatically.

---

## Dataverse Operational Model

### CheekyOrders Table

Dataverse table: `cr4b4_cheekyorders`

| Field            | Column                    | Description                  |
|------------------|---------------------------|------------------------------|
| OrderID          | cr4b4_cheekyordersid      | Auto GUID                    |
| CustomerName     | cr4b4_customername        | Display name                 |
| CustomerEmail    | cr4b4_customeremail       | Email address                |
| InvoiceID        | cr4b4_invoiceid           | Square invoice ID            |
| SquareOrderID    | cr4b4_squareorderid       | Square order ID              |
| PaymentID        | cr4b4_paymentid           | Square payment ID            |
| Product          | cr4b4_product             | Item description             |
| Quantity         | cr4b4_quantity            | Unit count                   |
| PrintType        | cr4b4_printtype           | Screen Print/DTG/Embroidery/DTF/Other |
| DueDate          | cr4b4_duedate             | When the order is due        |
| Status           | cr4b4_status              | Workflow status              |
| Notes            | cr4b4_notes               | Free text                    |
| CreatedDate      | cr4b4_createddate         | Timestamp                    |

### Order Statuses

| Status            | Meaning                                          |
|-------------------|--------------------------------------------------|
| Intake            | New order, not yet invoiced                       |
| Awaiting Payment  | Invoice sent, waiting for customer to pay         |
| Production Ready  | Paid and ready for production task generation      |
| Printing          | Currently being printed                           |
| QC                | Quality check in progress                         |
| Ready for Pickup  | Printed and waiting for customer                  |
| Completed         | Delivered                                         |

### ProductionTasks (Local Store)

Stored in `production-tasks.json` until a Dataverse table is provisioned.

| Field        | Description                              |
|------------- |------------------------------------------|
| TaskID       | Unique GUID                              |
| OrderID      | Links to CheekyOrders                    |
| CustomerName | Display name                             |
| Product      | Item description                         |
| Quantity     | Unit count                               |
| PrintType    | Screen Print/DTG/Embroidery/DTF/Other    |
| DueDate      | When the task is due                     |
| Priority     | Rush / Due Tomorrow / Due This Week / Normal |
| Status       | Production Ready / Printing / QC / Ready for Pickup / Completed |
| AssignedTo   | Operator name                            |
| Notes        | Free text                                |
| CreatedDate  | Timestamp                                |

---

## Webhook Behavior

### Duplicate Prevention
- Each event has an `event_id` tracked in `logs/processed-events.log`
- Duplicate events are logged and skipped
- Orders are checked by InvoiceID or SquareOrderID before creation

### Self-Healing
- If Dataverse is unreachable, warnings are logged and processing continues
- If production-manager.ps1 is missing, webhook agent still processes financial events
- Missing log directories are created automatically

---

## CLI Commands

| Command                    | Description                                  |
|--------------------------- |----------------------------------------------|
| `cheeky sync square`      | Pull Square invoices/orders/payments to Dataverse |
| `cheeky orders today`     | Show orders due today                        |
| `cheeky orders tomorrow`  | Show orders due tomorrow                     |
| `cheeky orders production`| Show orders with Status = Production Ready/Printing/QC |
| `cheeky payments today`   | List payments received today from Square     |
| `cheeky customer lookup`  | Look up a Square customer by ID              |
| `cheeky customer history` | Show all orders for a customer               |
| `cheeky production today` | Grouped print schedule for today             |
| `cheeky production tomorrow` | Grouped print schedule for tomorrow       |
| `cheeky production summary`  | Totals by print type, status, priority    |
| `cheeky task create`      | Generate missing production tasks from orders |
| `cheeky task update`      | Change a task status                         |
| `cheeky invoice create`   | Create a Square invoice                      |
| `cheeky invoice send`     | Send a Square invoice                        |
| `cheeky quote create`     | Create a quote for a customer                |
| `cheeky unpaid`           | Show unpaid invoices                         |
| `cheeky reminder`         | Send payment reminder                        |
| `cheeky order-complete`   | Mark order completed                         |
| `cheeky order-ready`      | Mark order ready for pickup                  |
| `cheeky email-scan`       | Scan inbox for order emails                  |

---

## Natural Language Examples

These phrases are recognized by `copilot-commands.ps1`:

| say this                                  | Runs this                    |
|------------------------------------------ |------------------------------|
| sync square data                          | `cheeky sync square`         |
| pull from square                          | `cheeky sync square`         |
| what orders are waiting for production    | `cheeky orders production`   |
| what jobs are due tomorrow                | `cheeky production tomorrow` |
| what should we print today                | `cheeky production today`    |
| did Greenville High pay yet               | `cheeky payments today`      |
| show today's payments                     | `cheeky payments today`      |
| show tomorrow's production                | `cheeky production tomorrow` |
| create order from Square payment          | `cheeky sync square`         |
| send invoice to new customer              | `cheeky invoice create`      |
| show customer history                     | `cheeky customer history`    |
| who hasn't paid                           | `cheeky unpaid`              |
| send payment reminder                     | `cheeky reminder`            |
| mark order ready for pickup               | `cheeky order-ready`         |
| scan inbox                                | `cheeky email-scan`          |

---

## Required Credentials

Before running, you need to provide:

| Value                | Where                          | How to get it                           |
|--------------------- |-------------------------------|-----------------------------------------|
| squareAccessToken    | square-config.json            | Square Developer Dashboard > Applications > Access Token |
| locationId           | square-config.json            | Square Developer Dashboard > Locations   |
| webhookSignatureKey  | square-config.json            | Square Developer Dashboard > Webhooks > Signature Key |
| ENV_URL              | Environment variable          | Your Dataverse org URL (e.g. https://org143bbb56.crm.dynamics.com) |
| PAC auth             | pac auth create               | Already configured for Customer.service@cheekyteesllc.com |

---

## Log Files

| Log file                      | Purpose                          |
|------------------------------ |----------------------------------|
| logs/square-api.log           | All Square API calls             |
| logs/square-webhooks.log      | Webhook event processing         |
| logs/orders.log               | Dataverse order CRUD operations  |
| logs/production.log           | Production task and schedule ops |
| logs/cheeky-commands.log      | Natural language command mapping  |
| logs/processed-events.log     | Webhook dedup tracking           |

---

## File Map

| File                        | Purpose                                    |
|---------------------------- |--------------------------------------------|
| square-config.json          | Square credentials and settings            |
| square-api.ps1              | Square REST API module + Sync-SquareToDataverse |
| square-webhook-agent.ps1    | Webhook event processor (4 event types)    |
| orders-engine.ps1           | Dataverse CheekyOrders CRUD                |
| production-manager.ps1      | Production tasks, scheduling, summaries    |
| copilot-commands.ps1        | Natural language command translator         |
| cheeky-orchestrator.ps1     | Master CLI orchestrator                    |
| cheeky.cmd                  | CLI launcher                               |
| production-tasks.json       | Local production task store (auto-created)  |
