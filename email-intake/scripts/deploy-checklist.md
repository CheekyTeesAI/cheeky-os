# Cheeky OS — Deployment Checklist

> **Version:** 1.0 (Phase 15)
> **Environment:** Windows Server / PM2
> **Last Updated:** 3/20/2026

---

## Pre-Deploy Checklist

- [ ] `.env` file exists in `email-intake/` with all required variables filled in
- [ ] All tests passing: `node tests/test-runner.js --all`
- [ ] Node.js v18+ installed: `node --version`
- [ ] PM2 installed globally: `npm install -g pm2`
- [ ] Port 3000 (or configured PORT) is open and not in use
- [ ] All npm dependencies installed: `npm install`
- [ ] No syntax errors: `node -c start.js && node -c webhook/server.js`

---

## Deploy Steps

### Option A: Automated Install (Recommended)

```powershell
cd email-intake
.\scripts\install.ps1
```

This script will:
1. Check Node.js version (v18+ required)
2. Run `npm install`
3. Check for `.env` file
4. Install PM2 if not present
5. Run all tests
6. Start PM2 with `ecosystem.config.js`

### Option B: Manual Deploy

```powershell
cd email-intake

# 1. Install dependencies
npm install

# 2. Run tests
node tests/test-runner.js --all

# 3. Start with PM2
pm2 start ecosystem.config.js

# 4. Verify
pm2 status
curl http://localhost:3000/health
```

### Option C: Run Without PM2 (Development)

```powershell
cd email-intake
node start.js
```

---

## Post-Deploy Verification

Run these checks after deploying:

```powershell
# 1. Check PM2 processes are running
pm2 status
# Should show: cheeky-os (online), cheeky-health (online)

# 2. Check health endpoint
curl http://localhost:3000/health
# Should return: {"status":"ok","service":"Cheeky Tees Webhook Intake",...}

# 3. Check logs for errors
pm2 logs cheeky-os --lines 20
pm2 logs cheeky-health --lines 10

# 4. Test webhook endpoint
curl -X POST http://localhost:3000/intake -H "Content-Type: application/json" -d "{\"customerName\":\"Deploy Test\",\"product\":\"T-Shirts\",\"quantity\":\"1\"}"
# Should return 201 with success: true

# 5. Verify health monitor is pinging
type logs\health-monitor.log
# Should show periodic "Health check OK" entries
```

---

## How to Check Logs

| Log File | Command | Contents |
|----------|---------|----------|
| Application stdout | `pm2 logs cheeky-os` | Server requests, pipeline output |
| Application errors | `type logs\pm2-error.log` | Crash logs, unhandled errors |
| Health monitor | `pm2 logs cheeky-health` | Health check results, alerts |
| Intake pipeline | `type logs\intake.log` | Order processing details |
| Email poller | `type logs\email-poller.log` | Outlook polling activity |
| Webhook server | `type logs\webhook.log` | HTTP request logs |
| Square integration | `type logs\square.log` | Square API calls |
| Column check | `type logs\column-check.log` | Dataverse schema validation |

---

## How to Restart Individual Services

```powershell
# Restart everything
pm2 restart all

# Restart just the main app (webhook + email poller)
pm2 restart cheeky-os

# Restart just the health monitor
pm2 restart cheeky-health

# Reload with zero downtime (if supported)
pm2 reload cheeky-os
```

---

## How to Stop Everything Safely

```powershell
# Graceful stop (waits for active requests to finish)
pm2 stop all

# Remove all PM2 processes
pm2 delete all

# Save current PM2 process list (for auto-start on reboot)
pm2 save

# Set up PM2 to start on Windows boot
pm2-startup
```

---

## Rollback Instructions

If the deployment fails or causes issues:

### Quick Rollback (Restart Previous Version)

```powershell
# 1. Stop the current deployment
pm2 stop all

# 2. Restore previous code
git checkout HEAD~1

# 3. Reinstall dependencies
npm install

# 4. Run tests to verify
node tests/test-runner.js --all

# 5. Restart
pm2 start ecosystem.config.js
```

### Manual Rollback (If Git Is Not Available)

```powershell
# 1. Stop everything
pm2 stop all

# 2. Replace files with backup
# (Keep a zip/copy of the email-intake folder before each deploy)

# 3. Reinstall and restart
npm install
pm2 start ecosystem.config.js
```

### Emergency: Run Without PM2

If PM2 itself is the problem:

```powershell
pm2 kill
node start.js
```

---

## Environment Variables Reference

These must be set in `.env` before deploying:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | For email intake | OpenAI API key |
| `DATAVERSE_URL` | For order storage | Dataverse org URL |
| `DATAVERSE_TENANT_ID` | For client-cred auth | Azure AD tenant |
| `DATAVERSE_CLIENT_ID` | For client-cred auth | App registration ID |
| `DATAVERSE_CLIENT_SECRET` | For client-cred auth | App registration secret |
| `AZURE_TENANT_ID` | For email poller | Graph API tenant |
| `AZURE_CLIENT_ID` | For email poller | Graph API app ID |
| `AZURE_CLIENT_SECRET` | For email poller | Graph API app secret |
| `OUTLOOK_USER_EMAIL` | For email poller | Mailbox to poll |
| `PORT` | Optional (default 3000) | Webhook server port |
| `WEBHOOK_SECRET` | Optional | Auth header value |
| `SQUARE_ACCESS_TOKEN` | For Square integration | Square API token |
| `SQUARE_LOCATION_ID` | For Square integration | Square location |
| `SQUARE_ENVIRONMENT` | Optional (default sandbox) | sandbox or production |
| `TEAMS_WEBHOOK_URL` | For health alerts | Teams incoming webhook URL |
