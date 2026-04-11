# Orders Export Endpoint — Setup & Usage

## What This Is

A **read-only** API endpoint that queries Dataverse for orders with `ct_cashpriority = 'URGENT_CASH'` and returns them as clean JSON. No writes, no updates, no triggers, no side effects.

## Quick Start

```bash
cd email-intake
node api/orders-export.js
```

The server starts on port **3000** (separate from the main webhook server on 3000).

## Endpoint

### `GET /api/orders/export`

Returns all URGENT_CASH orders from the `ct_orderses` table.

**Response:**
```json
{
  "success": true,
  "count": 3,
  "filter": "ct_cashpriority eq 'URGENT_CASH'",
  "exportedAt": "2026-03-21T12:00:00.000Z",
  "orders": [
    {
      "customerName": "John Smith",
      "orderTotal": 1250.00,
      "depositPaid": 625.00,
      "quoteSentDate": "2026-03-15",
      "productionStatus": "printing",
      "cashPriority": "URGENT_CASH"
    }
  ]
}
```

**Fields returned:**
| Field | Dataverse Column | Description |
|-------|-----------------|-------------|
| customerName | ct_customername | Customer name |
| orderTotal | ct_ordertotal | Total order amount |
| depositPaid | ct_depositpaid | Deposit amount paid |
| quoteSentDate | ct_quotesentdate | Date quote was sent |
| productionStatus | ct_productionstatus | Current production stage |
| cashPriority | ct_cashpriority | Cash priority flag |

### `GET /api/orders/health`

Health check for the export service.

## Environment Variables

These are already in your `.env` file from the main system setup:

```env
DATAVERSE_URL=https://yourorg.crm.dynamics.com
DATAVERSE_TENANT_ID=your-tenant-id
DATAVERSE_CLIENT_ID=your-client-id
DATAVERSE_CLIENT_SECRET=your-client-secret
```

Optional — change the export server port (default 3000):
```env
EXPORT_PORT=3000
```

## Azure AD App Permissions

The same app registration used for the main system works here. It needs:

- **Dynamics CRM** → `user_impersonation` (Application permission)
- Admin consent granted

No additional permissions are needed — this endpoint only reads data.

## Testing

```bash
# Start the server
node api/orders-export.js

# In another terminal, query the endpoint
curl http://localhost:3000/api/orders/export
```

## Safety

- **READ-ONLY** — uses HTTP GET against Dataverse Web API
- **No writes** — never calls POST/PATCH/DELETE on Dataverse
- **No triggers** — does not fire Power Automate flows
- **No side effects** — no Square calls, no email, no Teams messages
- **Safe for production** — can be called repeatedly without risk
