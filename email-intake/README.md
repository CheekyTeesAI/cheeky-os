# Email Intake Engine

Raw email text → structured JSON → Dataverse, powered by OpenAI GPT-4.1.

## Setup

```bash
cd email-intake
npm install
```

## Set your API key

**PowerShell:**
```powershell
$env:OPENAI_API_KEY = "sk-..."
```

**Bash / macOS:**
```bash
export OPENAI_API_KEY="sk-..."
```

## Run

```bash
npm start
```

This extracts order details from the sample email and logs JSON. If Dataverse
credentials are configured (see below), it also pushes the order automatically.

## Cheeky OS v4.3 (full server) — verify

`npm start` in **`email-intake`** runs **`cheeky-os/server.js`** (production surface). After the console shows **listening**:

```bash
npm run test:dashboard
curl -s http://127.0.0.1:3000/health
```

Power Apps: **`docs/power-apps-dashboard-integration-playbook.md`** and **`docs/cheeky-os-power-apps-connector.openapi.yaml`**. Set **`CHEEKY_DASHBOARD_API_KEY`** when dashboard auth is required.

## Dataverse integration (optional)

The script will send extracted orders to Dataverse when **either** env var is set:

| Variable | Description |
|---|---|
| `DATAVERSE_TOKEN` | Pre-obtained Bearer token (e.g. from device-code flow) |
| `DATAVERSE_CLIENT_SECRET` | App-registration secret (client-credentials flow) |
| `DATAVERSE_URL` | Override org URL (default: `https://org143bbb56.crm.dynamics.com`) |
| `DATAVERSE_TENANT_ID` | Override tenant (default from workflow script) |
| `DATAVERSE_CLIENT_ID` | Override client app ID (default from workflow script) |

**Quick test with a token from the PS workflow:**
```powershell
$env:DATAVERSE_TOKEN = (Get-Content .dv_token.tmp -Raw).Trim()
npm start
```

**Client-credentials flow:**
```powershell
$env:DATAVERSE_CLIENT_SECRET = "your-app-secret"
npm start
```

If neither variable is set, the script still runs and logs the JSON — it just
skips the Dataverse step with an info message.

## Example output

Given the sample email baked into `intake.js`, you'll get:

```json
{
  "customerName": "Marcus Rivera",
  "email": "marcus.rivera@riversideysl.org",
  "phone": "(951) 555-0173",
  "product": "Jerseys",
  "quantity": "120",
  "sizes": "60 Medium, 60 Large",
  "printType": "Full sublimation",
  "notes": "League crest on front, player numbers on back. Requesting a quick quote.",
  "deadline": "March 15, 2025"
}
```

## Customising

Edit the `emailText` variable in `intake.js` to test with different emails.

---

## Staff Usage Guide

### Running the intake tool
```
node intake.js
```
Paste the customer's order when prompted. Press Enter twice when done.

### Example session
```
Paste customer order below. Press Enter twice when done:

Hi, I need 24 black t-shirts with our logo on the front.
Sizes: S(4), M(8), L(8), XL(4). Contact: jane@acme.com / 864-555-1234.
[Enter]
[Enter]
```

### JSON test mode
To test without calling OpenAI, use the `--json` flag:
```
node intake.js --json '{"customerName":"Test","email":"test@test.com","product":"t-shirts","quantity":"10","sizes":"M","printType":"screen print","notes":"","deadline":"","phone":"555-0000"}'
```

Or type `JSON` as the first line when prompted, then paste a JSON object.

### Running tests
```
node --test tests/intake.test.js
```

### Log location
All intake activity is logged to: `logs/intake.log`

---

## System Architecture

```
email-intake/
├── intake.js                     # Core pipeline: extraction → mapping → Dataverse
├── start.js                      # Unified launcher: webhook + email poller
├── package.json
├── .env                          # Secrets (never committed)
├── .env.example                  # Template (safe to commit)
│
├── email-listener/
│   ├── graph-client.js           # Microsoft Graph API auth + mail fetch
│   └── email-poller.js           # 5-min Outlook inbox poller
│
├── webhook/
│   └── server.js                 # Express server: POST /intake, GET /health
│
├── dataverse/
│   └── column-check.js           # Live schema validation tool
│
├── bridge/
│   ├── bridge-runner.js          # CLI: node bridge-runner.js "command"
│   ├── parse-command.js          # Keyword parser + entity extraction
│   ├── route-command.js          # Ticket router + file saver
│   ├── command-schema.json       # JSON Schema for tickets
│   ├── command-types.json        # 13 command types + 8 target areas
│   ├── README.md                 # Bridge-specific documentation
│   ├── tickets/                  # Saved routed tickets (runtime)
│   ├── errors/                   # Saved unknown commands (runtime)
│   └── examples/
│       ├── sample-commands.json  # 12 realistic Cheeky commands
│       └── sample-output.json    # Sample parsed ticket output
│
├── utils/
│   ├── mapping.js                # Print type, product category, choice values
│   └── logger.js                 # Console + file logging
│
├── logs/                         # All log files (runtime, gitignored)
│   ├── intake.log                # Manual intake + pipeline logs
│   ├── email-poller.log          # Email poller activity
│   ├── webhook.log               # Webhook server requests
│   └── column-check.log          # Schema validation results
│
├── docs/
│   └── power-automate-trigger-spec.md  # Flow 1 + Flow 2 documentation
│
└── tests/
    └── intake.test.js            # 10 automated tests
```

---

## Running the Full Pipeline

The Cheeky OS system includes multiple services that can run together or independently.

### 1. Unified startup (recommended)

Start both the webhook server and email poller in a single process:

```bash
cd email-intake
node start.js
```

This will:
- Start the **Webhook Server** on the configured port (default 3000)
  - `POST /intake` — accepts pre-structured order JSON
  - `GET /health` — returns uptime and status
- Start the **Email Poller** polling Outlook every 5 minutes (if Graph API config is set)
- Print a startup summary showing which services are active
- Shut down cleanly on Ctrl+C (SIGINT/SIGTERM)

If Graph API environment variables are missing, `start.js` will skip the email poller with a warning and continue running the webhook server alone.

### 2. Individual services

Run each service independently:

```bash
# Webhook server only (Express on port 3000)
node webhook/server.js

# Email poller only (5-min Outlook poll cycle)
node email-listener/email-poller.js

# Manual intake (interactive CLI — paste email text or JSON)
node intake.js

# Manual intake with JSON bypass (skips OpenAI)
node intake.js --json '{"customerName":"Test","product":"T-Shirts","quantity":"10","sizes":"M","printType":"screen print"}'
```

### 3. Webhook usage

Submit a pre-structured order via HTTP (bypasses OpenAI entirely):

```bash
curl -X POST http://localhost:3000/intake \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test Order","product":"T-Shirts","quantity":"50","printType":"screen print","email":"test@example.com","phone":"555-1234","sizes":"25 M, 25 L","notes":"Logo on front","deadline":"2025-07-01"}'
```

If `WEBHOOK_SECRET` is set in `.env`, include the auth header:
```bash
curl -X POST http://localhost:3000/intake \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret-here" \
  -d '{"customerName":"Secured Order","product":"Hoodies","quantity":"20","printType":"DTG"}'
```

Health check:
```bash
curl http://localhost:3000/health
# → {"status":"ok","uptime":123,"startedAt":"2025-06-15T14:00:00.000Z"}
```

### 4. Dataverse column check

Verify your Dataverse table schema matches what the pipeline expects:

```bash
node dataverse/column-check.js
```

Reports FOUND and MISSING columns for `ct_orderses`. Results are printed to the console and saved to `logs/column-check.log`.

### 5. Cheeky Bridge (command system)

Issue plain-English commands that get parsed into structured tickets:

```bash
# Basic usage
node bridge/bridge-runner.js "Build a quote calculator for custom orders"

# Specify who issued the command and source
node bridge/bridge-runner.js --from Chad --source mobile "Fix the date parsing bug"

# List all saved tickets and errors
node bridge/bridge-runner.js --list

# Help
node bridge/bridge-runner.js --help
```

Tickets are saved to `bridge/tickets/{id}.json`. Unclassifiable commands go to `bridge/errors/{id}.json`. See `bridge/README.md` for full details.

### 6. Running tests

```bash
node --test tests/intake.test.js
```

All 10 tests should pass. Tests cover: manual paste, JSON mode, print type mapping, product category mapping, OpenAI retry/fallback, and Dataverse submission.

---

## Log Files

All logs are written to the `logs/` directory:

| Log File | Source | Contents |
|----------|--------|----------|
| `logs/intake.log` | `intake.js` | Extraction results, Dataverse POST, labor records, errors |
| `logs/email-poller.log` | `email-poller.js` | Poll cycles, email processing, Graph API calls |
| `logs/webhook.log` | `server.js` | Incoming HTTP requests, auth checks, responses |
| `logs/column-check.log` | `column-check.js` | Schema validation results |

---

## Required Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required For | Description |
|----------|-------------|-------------|
| `OPENAI_API_KEY` | Manual intake, email poller | OpenAI API key for GPT-4.1 extraction |
| `DATAVERSE_URL` | All Dataverse operations | Your org URL (e.g. `https://org123.crm.dynamics.com`) |
| `DATAVERSE_TOKEN` | Dataverse (option A) | Pre-obtained Bearer token |
| `DATAVERSE_CLIENT_SECRET` | Dataverse (option B) | App registration secret |
| `DATAVERSE_TENANT_ID` | Dataverse (option B) | Azure AD tenant ID |
| `DATAVERSE_CLIENT_ID` | Dataverse (option B) | App registration client ID |
| `AZURE_TENANT_ID` | Email poller | Azure AD tenant for Graph API |
| `AZURE_CLIENT_ID` | Email poller | App registration for Graph API |
| `AZURE_CLIENT_SECRET` | Email poller | App secret for Graph API |
| `OUTLOOK_USER_EMAIL` | Email poller | Mailbox to poll (e.g. `orders@cheekytees.com`) |
| `PORT` | Webhook server | Server port (default: 3000) |
| `WEBHOOK_SECRET` | Webhook server | Optional auth header value |

**Authentication options for Dataverse:**

- **Option A (quick test):** Set `DATAVERSE_TOKEN` with a pre-obtained Bearer token. Simplest for development.
- **Option B (production):** Set `DATAVERSE_CLIENT_SECRET`, `DATAVERSE_TENANT_ID`, and `DATAVERSE_CLIENT_ID` for client-credentials flow. Token refreshes automatically.
