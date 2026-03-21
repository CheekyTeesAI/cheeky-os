# Cheeky AI Production Manager

AI-driven production scheduling layer for CheekyTees print shop operations.

Turns incoming orders into a usable daily production schedule, grouped by print type, sorted by priority.

---

## Production Queue Model

Each production task tracks a single printable unit of work:

| Field        | Description                          |
|------------- |--------------------------------------|
| TaskID       | Unique GUID                          |
| OrderID      | Source CheekyOrder ID (Dataverse)    |
| CustomerName | Customer display name                |
| Product      | Item description (e.g. "Hoodies")    |
| Quantity     | Unit count                           |
| PrintType    | Screen Print, DTG, Embroidery, DTF, Other |
| DueDate      | ISO date/time                        |
| Priority     | Rush, Due Tomorrow, Due This Week, Normal |
| Status       | Production Ready, Printing, QC, Ready for Pickup, Completed |
| AssignedTo   | Operator name (optional)             |
| Notes        | Free text from order                 |
| CreatedDate  | ISO timestamp of task creation       |

Tasks are stored locally in `production-tasks.json` until a dedicated Dataverse table is provisioned.

---

## Task Generation Rules

`New-ProductionTasksFromOrders` reads CheekyOrders from Dataverse where `Status = 'Production Ready'`.

- One task is created per qualifying order.
- Duplicate prevention: if a task already exists for an OrderID, it is skipped.
- Tasks are grouped by OrderID and PrintType.
- If Dataverse is unreachable, the function logs a warning and continues gracefully.

---

## Priority Auto-Assignment

Priority is calculated dynamically from the DueDate each time tasks are queried:

| Condition                        | Priority       |
|--------------------------------- |----------------|
| Due within 24 hours              | Rush           |
| Due before end of tomorrow       | Due Tomorrow   |
| Due within 7 days                | Due This Week  |
| Everything else                  | Normal         |

Overdue tasks (due before today, not completed) are automatically promoted to **Rush** in the daily schedule.

---

## Scheduling Logic

`Build-DailyPrintSchedule` and `Build-TomorrowPrintSchedule` produce formatted production boards.

### Grouping

Tasks are grouped by PrintType in this order:

1. Screen Print
2. DTG
3. Embroidery
4. DTF
5. Other

### Sorting (within each group)

1. Priority (Rush first)
2. DueDate (earliest first)
3. Quantity (largest first)

### Example Output

```
  TODAY'S PRODUCTION
  ------------------

  SCREEN PRINT
    - Greenville High | 120 Hoodies | Due Jan 15 3:00 PM ** RUSH **
    - Fountain Inn Church | 50 Tees | Due Jan 16 9:00 AM [Due Tomorrow]

  DTG
    - Smith Custom | 12 Tees | Due Jan 15 5:00 PM ** RUSH **
```

---

## CLI Commands

All commands run through the `cheeky` CLI:

| Command                  | Action                                      |
|------------------------- |---------------------------------------------|
| `cheeky production today`    | Show today's production schedule         |
| `cheeky production tomorrow` | Show tomorrow's production schedule      |
| `cheeky production summary`  | Totals by print type, status, priority   |
| `cheeky task create`         | Generate missing tasks from orders       |
| `cheeky task update`         | Update a task or order status            |

---

## Natural Language Examples

These phrases are recognized by `copilot-commands.ps1` and mapped to CLI commands:

| Say this                            | Runs this                    |
|------------------------------------ |------------------------------|
| What should we print today          | `cheeky production today`    |
| What jobs are due tomorrow          | `cheeky production tomorrow` |
| Show today's screen print jobs      | `cheeky production today`    |
| Show rush jobs                      | `cheeky production today`    |
| Show production summary             | `cheeky production summary`  |
| Generate tasks                      | `cheeky task create`         |
| Mark order as printing              | `cheeky task update`         |
| Mark order complete                 | `cheeky order-complete`      |
| Mark order ready for pickup         | `cheeky order-ready`         |

---

## Logging

All production activity is logged to:

```
logs/production.log
```

Events logged:
- Task generation (created, skipped duplicates, Dataverse failures)
- Schedule builds (today, tomorrow)
- Task status changes (old status -> new status)

---

## File Map

| File                     | Purpose                                    |
|------------------------- |--------------------------------------------|
| `production-manager.ps1` | Core module: tasks, scheduling, summaries |
| `production-tasks.json`  | Local task store (auto-created)           |
| `logs/production.log`    | Production activity log                   |
| `cheeky-orchestrator.ps1`| CLI routing for production/task commands  |
| `copilot-commands.ps1`   | Natural language mappings                 |

---

## Constraints

- PowerShell 5.1 compatible (no PS 7+ features)
- Does not break existing deployment scripts
- Reuses existing order engine and CLI structure
- Self-healing: missing files or tables produce warnings, not crashes
- Dataverse connectivity is optional; local task store is always available
