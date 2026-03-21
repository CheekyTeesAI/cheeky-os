# Cheeky Bridge v0.1

**Plain-English commands → Structured tickets → Automated execution**

The Bridge is the translation layer between Cheeky AI (M365 Copilot on Pat's iPhone) and GitHub Copilot. Pat or Chad speaks or types a command in plain English, and the Bridge parses it into a structured JSON ticket that Copilot can execute.

## Architecture

```
Pat/Chad (voice/chat/mobile)
   ↓
Cheeky AI (M365 Copilot)
   ↓
Bridge CLI  (parse-command.js → route-command.js)
   ↓
Ticket JSON saved to /bridge/tickets/{id}.json
   ↓
GitHub Copilot reads ticket → executes work
```

## Quick Start

```bash
cd email-intake

# Issue a command
node bridge/bridge-runner.js "Build a quote calculator for custom orders"

# Issue a command with author and source
node bridge/bridge-runner.js --from Chad --source mobile "Fix the date parsing bug in intake"

# List all saved tickets
node bridge/bridge-runner.js --list

# Help
node bridge/bridge-runner.js --help
```

## Command Types

| Type | Description | Example |
|------|-------------|---------|
| `BUILD_FEATURE` | Build something new | "Build a production queue dashboard" |
| `MODIFY_FEATURE` | Change existing code | "Update intake to extract art file URLs" |
| `CREATE_TABLE` | New Dataverse table | "Create a table for garment inventory" |
| `UPDATE_TABLE` | Add/change columns | "Add a phone number column to ct_orders" |
| `CREATE_FLOW` | New Power Automate flow | "Create a flow that sends Teams alerts on new orders" |
| `UPDATE_FLOW` | Modify existing flow | "Update the confirmation flow to include sizes" |
| `CREATE_UI` | New screen/form/dashboard | "Build a customer lookup screen" |
| `FIX_BUG` | Fix an error | "Fix the email poller crash on empty HTML" |
| `QUOTE_OPS` | Quoting operations | "Calculate margins for the Rivera jersey order" |
| `SALES_OPS` | Sales operations | "Pull customer list from Square" |
| `PRODUCTION_OPS` | Production operations | "Show all orders due this week" |
| `DOCUMENT_SYSTEM` | Documentation | "Document the full system architecture" |
| `UNKNOWN` | Cannot classify | Saved to /bridge/errors/ for clarification |

## Target Areas

| Area | Keywords |
|------|----------|
| `intake` | intake, email, order, webhook, pipeline, extraction |
| `dataverse` | dataverse, table, column, entity, schema, crm |
| `automation` | flow, automate, power automate, trigger, schedule |
| `ui` | screen, form, dashboard, app, canvas, model-driven |
| `production` | production, print, queue, garment, proof, art, ship |
| `sales` | sales, customer, invoice, square, payment, lead |
| `quotes` | quote, price, estimate, margin, bid, cost |
| `ops` | document, readme, spec, deploy, backup, config |

## Priority Detection

Commands are automatically assigned priority based on urgency markers:

- **HIGH**: "urgent", "asap", "now", "immediately", "critical", "emergency", "rush"
- **LOW**: "when you can", "low priority", "eventually", "no rush", "nice to have"
- **MEDIUM**: Everything else (default)

## File Structure

```
bridge/
├── bridge-runner.js          # CLI entry point
├── parse-command.js          # Command → ticket parser
├── route-command.js          # Ticket router + file saver
├── command-schema.json       # JSON Schema for tickets
├── command-types.json        # Keyword classification rules
├── README.md                 # This file
├── tickets/                  # Successfully routed tickets
│   └── CB-20250615-a1b2c3.json
├── errors/                   # Unclassifiable commands
│   └── CB-20250615-x9y8z7.json
└── examples/
    ├── sample-commands.json  # 12 realistic Cheeky commands
    └── sample-output.json    # Sample parsed ticket output
```

## Ticket Schema

Every ticket follows `command-schema.json` and includes:

| Field | Description |
|-------|-------------|
| `id` | Unique ID: `CB-YYYYMMDD-{random6}` |
| `timestamp` | ISO 8601 when issued |
| `issuedBy` | Who gave the command (Pat, Chad, etc.) |
| `source` | Where it came from (cli, mobile, chat, voice) |
| `rawCommand` | Exact plain-English text |
| `commandType` | Classified type (see table above) |
| `priority` | HIGH, MEDIUM, or LOW |
| `targetArea` | System area targeted |
| `requestedAction` | Clear summary of what to do |
| `entities` | Tables, flows, screens, fields, integrations referenced |
| `constraints` | Rules for execution |
| `dependencies` | Other tickets this depends on |
| `acceptanceCriteria` | Conditions for "done" |
| `status` | NEW, IN_PROGRESS, COMPLETE, FAILED, UNKNOWN |
| `recommendedNextStep` | Suggested next action |

## Examples

See `examples/sample-commands.json` for 12 realistic commands that Pat and Chad would issue at Cheeky Tees, and `examples/sample-output.json` for what the parsed tickets look like.
