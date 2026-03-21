# Square Integration Setup — Cheeky Tees

> **Version:** 1.0 (Phase 10)
> **Module:** `integrations/square-client.js` + `integrations/square-mapper.js`

---

## Overview

The Square integration automatically creates customer records and invoices in Square when orders are submitted through the Cheeky Tees intake pipeline. It runs as a **fire-and-forget** step after the Dataverse POST succeeds — Square failures never block order creation.

### Pipeline Flow

```
Customer Email / Webhook
    ↓
OpenAI Extraction (or direct JSON)
    ↓
Map to Dataverse fields
    ↓
POST to Dataverse (ct_orderses)    ← order is SAVED here
    ↓
Create labor record (non-blocking)
    ↓
Square: getOrCreateCustomer()      ← fire-and-forget
Square: createInvoice()            ← fire-and-forget
    ↓
Done — order is fully processed
```

If Square fails at any point, the order is already safely in Dataverse. The failure is logged to `logs/square.log` and the pipeline continues.

---

## Getting Square API Credentials

### Step 1: Create a Square Developer Account

1. Go to [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Sign in with your Square account (or create one)
3. Click **"+"** to create a new application
4. Name it: `Cheeky Tees Intake`

### Step 2: Get Your Credentials

In your application dashboard:

1. **Access Token:**
   - For sandbox: Copy the **Sandbox Access Token** from the Credentials tab
   - For production: Copy the **Production Access Token**

2. **Location ID:**
   - Go to the **Locations** tab
   - Copy the Location ID for your Cheeky Tees location
   - In sandbox, a test location is auto-created

### Step 3: Configure `.env`

Add these variables to your `.env` file:

```env
# ── Square Integration ───────────────────────────────────
SQUARE_ACCESS_TOKEN=YOUR_SANDBOX_OR_PRODUCTION_TOKEN
SQUARE_LOCATION_ID=YOUR_LOCATION_ID
SQUARE_ENVIRONMENT=sandbox
```

---

## Sandbox vs Production

| Setting | Sandbox | Production |
|---------|---------|------------|
| `SQUARE_ENVIRONMENT` | `sandbox` | `production` |
| API Base URL | `connect.squareupsandbox.com` | `connect.squareup.com` |
| Real charges? | No | **Yes** |
| Real emails? | No | **Yes** |
| Test cards | Available | N/A |

### Switching to Production

1. Change `.env`:
   ```env
   SQUARE_ACCESS_TOKEN=your_production_token
   SQUARE_LOCATION_ID=your_production_location_id
   SQUARE_ENVIRONMENT=production
   ```

2. Restart the pipeline (`node start.js`)

> ⚠️ **Warning:** In production mode, invoices are **real** and emails are **sent to customers**. Test thoroughly in sandbox first.

---

## Testing with Sandbox

### Quick test via webhook:

```bash
curl -X POST http://localhost:3000/intake \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test Customer",
    "email": "test@example.com",
    "product": "T-Shirts",
    "quantity": "50",
    "printType": "screen print",
    "deadline": "2025-08-01"
  }'
```

### Check logs:

```bash
# Square-specific logs
cat logs/square.log

# Full intake logs (includes Square results)
cat logs/intake.log
```

### Verify in Square Dashboard:

1. Go to [Square Sandbox Dashboard](https://squareupsandbox.com/dashboard)
2. Check **Invoices** — you should see a new DRAFT invoice
3. Check **Customers** — you should see the test customer

---

## What Happens When Square Fails

The integration is designed to **never crash the pipeline**:

| Scenario | Behavior |
|----------|----------|
| `SQUARE_ACCESS_TOKEN` not set | Skipped silently, logged as warning |
| `SQUARE_LOCATION_ID` not set | Skipped silently, logged as warning |
| Network error to Square API | Logged to `logs/square.log`, pipeline continues |
| Invalid Square response | Logged to `logs/square.log`, pipeline continues |
| Customer search fails | Creates new customer instead (fallback) |
| Invoice creation fails | Logged, order still exists in Dataverse |
| Invoice publish fails | Draft invoice remains, logged as partial success |

Every failure is logged to `logs/square.log` with full error details for debugging.

---

## Square Webhook Endpoint

The server includes a `POST /square-webhook` endpoint that receives Square webhook events:

| Event | Action |
|-------|--------|
| `invoice.payment_made` | Logged to `logs/square.log` |
| `invoice.canceled` | Logged to `logs/square.log` |
| All other events | Acknowledged with 200 OK, logged |

### Configuring Square Webhooks

1. Go to [Square Developer Dashboard](https://developer.squareup.com/apps) → your app
2. Click **Webhooks** in the left nav
3. Add endpoint URL: `https://your-server.com/square-webhook`
4. Select events: `invoice.payment_made`, `invoice.canceled`
5. Save

> **Note:** Square requires webhook endpoints to respond within 10 seconds. The endpoint returns 200 OK immediately and logs asynchronously.

---

## Files

| File | Purpose |
|------|---------|
| `integrations/square-client.js` | Square API client (getOrCreateCustomer, createEstimate, createInvoice) |
| `integrations/square-mapper.js` | Field mapping (order → Square format) |
| `docs/square-setup.md` | This file |
| `logs/square.log` | All Square API activity |
