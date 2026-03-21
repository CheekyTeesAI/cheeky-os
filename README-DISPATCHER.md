# Cheeky Dispatcher - Natural Language Command Router

The dispatcher translates plain-English business requests into the correct internal Cheeky module calls with formatted, practical output.

## Usage

```
cheeky ask "what jobs are due tomorrow"
cheeky ask "show today's payments"
cheeky ask "mark order 1024 complete"
cheeky ask "did Greenville High pay yet"
cheeky ask "who has not paid"
```

Or run directly:

```powershell
.\dispatcher.ps1 -Request "what should we print today"
```

---

## Supported Requests

### Production

| Say this | Routes to |
|----------|-----------|
| what should we print today | `Build-DailyPrintSchedule` |
| show today's production | `Build-DailyPrintSchedule` |
| what jobs are due tomorrow | `Get-CheekyOrdersTomorrow` + `Build-TomorrowPrintSchedule` |
| show tomorrow's production | `Build-TomorrowPrintSchedule` |
| production summary | `Get-ProductionSummary` |
| show rush jobs | `Build-DailyPrintSchedule` |
| generate tasks | `New-ProductionTasksFromOrders` |

### Orders

| Say this | Routes to |
|----------|-----------|
| what orders are waiting for production | `Get-CheekyOrdersByStatus` (Production Ready, Printing, QC) |
| orders today | `Get-CheekyOrdersToday` |
| orders tomorrow | `Get-CheekyOrdersTomorrow` |

### Status Changes

| Say this | Routes to |
|----------|-----------|
| mark order 1024 as printing | `Update-ProductionTaskStatus` + `Update-CheekyOrderStatus` |
| mark order 1024 complete | `Set-OrderComplete` or status update |
| mark order ready for pickup | `Set-OrderReady` or status update |

Order IDs are extracted inline from the request. If no ID is found, you are prompted.

### Payments

| Say this | Routes to |
|----------|-----------|
| did Greenville High pay yet | `Get-CheekyOrdersByCustomer` + Square fallback |
| show today's payments | `Get-SquarePayments` |

Customer names are extracted inline from the request.

### Sales

| Say this | Routes to |
|----------|-----------|
| send invoice to new customer | `Create-SquareInvoice` |
| send invoice to customer | `Create-SquareInvoice` |
| create invoice for order | `Create-SquareInvoice` |
| send invoice | `Send-SquareInvoice` |
| create quote | `New-CheekyQuoteFromRequest` |
| show customer history | `Get-CustomerHistory` |
| who has not paid | `Get-UnpaidInvoices` |
| send payment reminder | `Send-PaymentReminder` |

### Email

| Say this | Routes to |
|----------|-----------|
| create quote from email | `Invoke-EmailScan` |
| scan inbox | `Invoke-EmailScan` |
| check email | `Invoke-EmailScan` |

### Data Sync

| Say this | Routes to |
|----------|-----------|
| sync square | `Sync-SquareToDataverse` |
| create order from Square payment | `Sync-SquareToDataverse` |

---

## Output Format

Responses are short, practical, and formatted for business use:

```
  JOBS DUE TOMORROW
  -----------------
  Greenville High | 120 Hoodies | Screen Print | Due Tue 3:00 PM
  Fountain Inn Church | 50 Tees | DTG | Due Tue 10:00 AM
```

```
  PAYMENT STATUS
  Customer: Greenville High
  Invoice:  SQ-228
  Status:   Paid (Production Ready)
```

```
  TODAYS PAYMENTS
  ---------------
  pay_abc123 | $450.00 | COMPLETED | 9:14 AM
  pay_def456 | $125.00 | COMPLETED | 11:30 AM
```

---

## Routing Behavior

1. Request is lowercased and matched against ~50 regex patterns
2. First match determines the intent (e.g., `jobs-tomorrow`, `mark-complete`)
3. Intent routes to a Dispatch-* handler function
4. Handler loads the appropriate module(s) and calls business functions
5. If inline parameters are found (order IDs, customer names), they are extracted automatically
6. Output is formatted with headers, rows, and consistent spacing
7. Every action is logged to `logs/dispatcher.log` and `business-audit.jsonl`

---

## Self-Healing

- If a required module is not found, the dispatcher logs a warning and returns a graceful message
- Missing configs (Square, email) produce helpful guidance instead of errors
- No hard failures - every code path has a fallback

---

## Files

| File | Purpose |
|------|---------|
| `dispatcher.ps1` | Main dispatcher with intent routing and formatted output |
| `copilot-commands.ps1` | Legacy NL translator (still works, routes to orchestrator) |
| `cheeky-orchestrator.ps1` | CLI orchestrator (routes `ask` to dispatcher) |
| `logs/dispatcher.log` | Dispatcher activity log |
| `business-audit.jsonl` | Audit trail for all dispatched actions |

---

## Architecture

```
User: "what jobs are due tomorrow"
  |
  v
cheeky ask "what jobs are due tomorrow"
  |
  v
cheeky-orchestrator.ps1 (ask command)
  |
  v
dispatcher.ps1
  |-- Resolve-Intent -> "jobs-tomorrow"
  |-- Dispatch-JobsTomorrow
  |     |-- Get-CheekyOrdersTomorrow (orders-engine.ps1)
  |     |-- Build-TomorrowPrintSchedule (production-manager.ps1)
  |-- Write formatted output
  |-- Log to dispatcher.log + business-audit.jsonl
```
