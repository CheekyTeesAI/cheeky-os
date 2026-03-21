# Endpoint Reference — Cheeky Tees Webhook Server

> **Version:** 2.0 (Phase 8)
> **Base URL:** `http://localhost:3000` (or deployed URL)
> **Authentication:** Include `x-webhook-secret` header if `WEBHOOK_SECRET` is configured in `.env`

---

## GET /health

Health check endpoint. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "service": "Cheeky Tees Webhook Intake",
  "uptime": "123s",
  "startedAt": "2025-06-15T14:00:00.000Z"
}
```

**Example:**
```bash
curl http://localhost:3000/health
```

---

## POST /intake

Submit a pre-structured order for Dataverse ingestion. Bypasses OpenAI — expects the same JSON shape that the extraction pipeline produces.

**Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customerName` | string | Yes* | Customer full name |
| `email` | string | No | Customer email address |
| `phone` | string | No | Customer phone number |
| `product` | string | Yes* | Product type (e.g. "T-Shirts", "Hoodies") |
| `quantity` | string | Yes* | Total quantity ordered |
| `sizes` | string | No | Size breakdown (e.g. "25 M, 25 L") |
| `printType` | string | No | Print method (e.g. "screen print", "DTG") |
| `notes` | string | No | Special instructions |
| `deadline` | string | No | Due date |

*At least one of `customerName`, `product`, or `quantity` must be provided.

**Response (201):**
```json
{
  "success": true,
  "requestId": "wh-1718461200000-a1b2c3",
  "recordId": "abc123-def456-ghi789",
  "customer": "Marcus Rivera",
  "message": "Order created successfully in Dataverse."
}
```

**Error (400):**
```json
{
  "success": false,
  "requestId": "wh-1718461200000-a1b2c3",
  "error": "Order must include at least one of: customerName, product, quantity."
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/intake \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret-here" \
  -d '{
    "customerName": "Marcus Rivera",
    "email": "marcus@example.com",
    "product": "Jerseys",
    "quantity": "120",
    "sizes": "60 M, 60 L",
    "printType": "Full sublimation",
    "notes": "League crest on front",
    "deadline": "2025-07-15"
  }'
```

---

## POST /order-complete

Mark an order as complete and trigger customer notification. Called by Power Automate (Flow 1) or internal tools when production finishes.

**Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderId` | string | Yes | Dataverse record ID or order reference |
| `customerName` | string | Yes | Customer full name |
| `email` | string | Yes | Customer email for notification |
| `product` | string | Yes | Product type |
| `quantity` | string | Yes | Total quantity |

**Response (200):**
```json
{
  "success": true,
  "requestId": "oc-1718461200000-a1b2c3",
  "message": "Order abc-123 marked complete. Customer notification queued for marcus@example.com."
}
```

**Error (400):**
```json
{
  "success": false,
  "requestId": "oc-1718461200000-a1b2c3",
  "error": "Missing required fields: orderId, email",
  "requiredFields": ["orderId", "customerName", "email", "product", "quantity"]
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/order-complete \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret-here" \
  -d '{
    "orderId": "abc123-def456-ghi789",
    "customerName": "Marcus Rivera",
    "email": "marcus@example.com",
    "product": "Jerseys",
    "quantity": "120"
  }'
```

---

## POST /notify-customer

Send a notification to a customer about their order status. Called by Power Automate or internal tools.

**Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Customer email address |
| `customerName` | string | Yes | Customer full name |
| `orderId` | string | Yes | Dataverse record ID or order reference |
| `status` | string | Yes | Current status (e.g. "received", "in production", "shipped") |
| `message` | string | No | Custom message (defaults to status summary) |

**Response (200):**
```json
{
  "success": true,
  "requestId": "nc-1718461200000-a1b2c3",
  "notified": true,
  "email": "marcus@example.com",
  "orderId": "abc123-def456-ghi789",
  "status": "shipped",
  "message": "Your order abc123-def456-ghi789 has shipped! Tracking info to follow."
}
```

**Error (400):**
```json
{
  "success": false,
  "requestId": "nc-1718461200000-a1b2c3",
  "error": "Missing required fields: email, status",
  "requiredFields": ["email", "customerName", "orderId", "status"]
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/notify-customer \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret-here" \
  -d '{
    "email": "marcus@example.com",
    "customerName": "Marcus Rivera",
    "orderId": "abc123-def456-ghi789",
    "status": "shipped",
    "message": "Your order has shipped! Tracking info to follow."
  }'
```

---

## POST /production-update

Update the production stage for an order. Called by Power Automate, the production dashboard, or internal tools as orders move through the shop.

**Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderId` | string | Yes | Dataverse record ID or order reference |
| `stage` | string | Yes | Production stage (see valid values below) |
| `updatedBy` | string | Yes | Name of person or system making the update |
| `notes` | string | No | Additional notes about the update |

**Valid Stages:**
| Stage | Description |
|-------|-------------|
| `received` | Order received, queued for art |
| `art` | Art/proof in progress |
| `printing` | Printing/production in progress |
| `finished` | Production complete, ready to ship |
| `shipped` | Order shipped to customer |

**Response (200):**
```json
{
  "success": true,
  "requestId": "pu-1718461200000-a1b2c3",
  "orderId": "abc123-def456-ghi789",
  "stage": "printing",
  "updatedBy": "Chad",
  "notes": "Started screen print run — 120 jerseys",
  "message": "Order abc123-def456-ghi789 production stage updated to \"printing\"."
}
```

**Error (400 — missing fields):**
```json
{
  "success": false,
  "requestId": "pu-1718461200000-a1b2c3",
  "error": "Missing required fields: stage, updatedBy",
  "requiredFields": ["orderId", "stage", "updatedBy"]
}
```

**Error (400 — invalid stage):**
```json
{
  "success": false,
  "requestId": "pu-1718461200000-a1b2c3",
  "error": "Invalid stage: \"cooking\". Must be one of: received, art, printing, finished, shipped",
  "validStages": ["received", "art", "printing", "finished", "shipped"]
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/production-update \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret-here" \
  -d '{
    "orderId": "abc123-def456-ghi789",
    "stage": "printing",
    "updatedBy": "Chad",
    "notes": "Started screen print run — 120 jerseys"
  }'
```

---

## Error Responses

All endpoints return consistent error shapes:

| HTTP Code | Meaning |
|-----------|---------|
| `200` | Success (for status/update endpoints) |
| `201` | Created (for /intake) |
| `400` | Bad request — missing fields or invalid data |
| `401` | Unauthorized — invalid or missing `x-webhook-secret` header |
| `404` | Route not found |
| `500` | Internal server error |

## Power Automate Integration

These endpoints are designed to be called from Power Automate HTTP actions:

1. **Flow 1 (Order Confirmation)** — calls `POST /order-complete` when production finishes
2. **Flow 1 (Customer Notification)** — calls `POST /notify-customer` to confirm delivery
3. **Production Updates** — calls `POST /production-update` as orders move through stages
4. **Flow 2 (Email Intake Backup)** — calls `POST /intake` with parsed email data

See `docs/power-automate-trigger-spec.md` for full Flow specifications.
