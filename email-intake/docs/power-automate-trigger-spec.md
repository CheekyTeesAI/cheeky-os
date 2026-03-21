# Power Automate Trigger Specifications — Cheeky Tees

> **Version:** 1.0  
> **Author:** Cheeky OS / GitHub Copilot  
> **Last Updated:** Phase 4 Build  
> **System:** Cheeky Tees Intake Pipeline → Microsoft Dataverse → Power Automate

---

## Overview

These specifications define two Power Automate Cloud Flows that trigger
automatically when the Node.js intake pipeline creates records in Dataverse.

| Flow | Trigger | Purpose |
|------|---------|---------|
| Flow 1 | New row in `ct_orderses` | Order confirmation + team notification |
| Flow 2 | Scheduled (5 min) | Email intake trigger (backup for email-poller.js) |

---

## Flow 1: Order Confirmation & Team Notification

### Trigger

| Setting | Value |
|---------|-------|
| **Connector** | Microsoft Dataverse |
| **Trigger** | "When a row is added" |
| **Table name** | Orders (`ct_orderses`) |
| **Scope** | Organization |

### Actions (in order)

#### Step 1 — Initialize Variables

| Variable | Type | Value |
|----------|------|-------|
| `varRecordId` | String | `triggerOutputs()?['body/ct_ordersesid']` |
| `varCustomerName` | String | `triggerOutputs()?['body/ct_customername']` |
| `varCustomerEmail` | String | `triggerOutputs()?['body/ct_customeremail']` |
| `varProduct` | String | `triggerOutputs()?['body/ct_garmenttype']` |
| `varQuantity` | String | `triggerOutputs()?['body/ct_quantity']` |
| `varPrintType` | String | `triggerOutputs()?['body/ct_productiontype']` |
| `varDueDate` | String | `triggerOutputs()?['body/ct_duedate']` |
| `varNotes` | String | `triggerOutputs()?['body/ct_notes']` |

#### Step 2 — Condition: Has Customer Email?

| Setting | Value |
|---------|-------|
| **Condition** | `length(variables('varCustomerEmail'))` is greater than 0 |

**If Yes → Step 3 (Send Confirmation Email)**  
**If No → Skip to Step 4**

#### Step 3 — Send Confirmation Email (Outlook)

| Setting | Value |
|---------|-------|
| **Connector** | Office 365 Outlook |
| **Action** | "Send an email (V2)" |
| **To** | `variables('varCustomerEmail')` |
| **Subject** | `Order Received — Cheeky Tees #@{variables('varRecordId')}` |
| **Body (HTML)** | See template below |
| **From** | `orders@cheekytees.com` (or shared mailbox) |

**Email Body Template:**
```html
<h2>Thank you for your order, @{variables('varCustomerName')}!</h2>

<p>We've received your order and it's in the queue.</p>

<table border="1" cellpadding="8" style="border-collapse:collapse;">
  <tr><td><strong>Order ID</strong></td><td>@{variables('varRecordId')}</td></tr>
  <tr><td><strong>Product</strong></td><td>@{variables('varProduct')}</td></tr>
  <tr><td><strong>Quantity</strong></td><td>@{variables('varQuantity')}</td></tr>
  <tr><td><strong>Print Type</strong></td><td>@{variables('varPrintType')}</td></tr>
  <tr><td><strong>Due Date</strong></td><td>@{variables('varDueDate')}</td></tr>
  <tr><td><strong>Notes</strong></td><td>@{variables('varNotes')}</td></tr>
</table>

<p>We'll follow up with art proofs and a final quote within 1 business day.</p>

<p>— Cheeky Tees Team<br>
Fountain Inn, SC<br>
orders@cheekytees.com</p>
```

#### Step 4 — Post to Teams Channel

| Setting | Value |
|---------|-------|
| **Connector** | Microsoft Teams |
| **Action** | "Post message in a chat or channel" |
| **Post in** | Channel |
| **Team** | Cheeky Tees |
| **Channel** | #orders (or #production) |
| **Message** | See template below |

**Teams Message Template:**
```
📦 NEW ORDER: @{variables('varCustomerName')}
   Product: @{variables('varProduct')}
   Qty: @{variables('varQuantity')}
   Print: @{variables('varPrintType')}
   Due: @{variables('varDueDate')}
   ID: @{variables('varRecordId')}
```

#### Step 5 — Create Planner Task

| Setting | Value |
|---------|-------|
| **Connector** | Planner |
| **Action** | "Create a task" |
| **Group ID** | Cheeky Tees group |
| **Plan ID** | Production Plan |
| **Bucket** | New Orders |
| **Title** | `Order: @{variables('varCustomerName')} — @{variables('varProduct')} x@{variables('varQuantity')}` |
| **Due Date** | `variables('varDueDate')` |
| **Notes** | `Print: @{variables('varPrintType')}\nNotes: @{variables('varNotes')}\nOrder ID: @{variables('varRecordId')}` |
| **Assigned To** | (production lead email) |

#### Step 6 — Error Handling (Scope / Try-Catch Pattern)

Wrap Steps 3–5 in a **Scope** action named "Process Order Notifications".

Add a parallel branch **"On Failure"** configured to run after the scope fails:

| Setting | Value |
|---------|-------|
| **Connector** | Office 365 Outlook |
| **Action** | "Send an email (V2)" |
| **To** | `pat@cheekytees.com` |
| **Subject** | `⚠️ Flow Error: Order Notification Failed` |
| **Body** | `Order ID: @{variables('varRecordId')}\nCustomer: @{variables('varCustomerName')}\nError: @{actions('Process_Order_Notifications')?['error']?['message']}` |

---

## Flow 2: Email Intake Trigger (Backup Poller)

> **Note:** This flow is a backup/alternative to `email-poller.js`.
> Use either the Node.js poller OR this flow — not both simultaneously.

### Trigger

| Setting | Value |
|---------|-------|
| **Connector** | Recurrence |
| **Frequency** | Minute |
| **Interval** | 5 |

### Actions (in order)

#### Step 1 — Get Unread Emails

| Setting | Value |
|---------|-------|
| **Connector** | Office 365 Outlook |
| **Action** | "Get emails (V3)" |
| **Folder** | Inbox |
| **Filter Query** | `isRead eq false` |
| **Top** | 10 |
| **Importance** | Any |

#### Step 2 — Apply to Each (loop over emails)

**For each** email in Step 1 results:

##### Step 2a — HTTP POST to Webhook

| Setting | Value |
|---------|-------|
| **Connector** | HTTP |
| **Method** | POST |
| **URI** | `http://localhost:3000/intake` (or deployed URL) |
| **Headers** | `Content-Type: application/json`, `x-webhook-secret: (your secret)` |
| **Body** | See below |

**Body (JSON):**
```json
{
  "customerName": "",
  "email": "@{items('Apply_to_each')?['from']}",
  "phone": "",
  "product": "",
  "quantity": "",
  "sizes": "",
  "printType": "",
  "notes": "@{items('Apply_to_each')?['bodyPreview']}",
  "deadline": "",
  "_rawEmailSubject": "@{items('Apply_to_each')?['subject']}",
  "_rawEmailBody": "@{items('Apply_to_each')?['body']}"
}
```

> **Note:** The webhook endpoint currently expects pre-structured JSON.
> For raw email text, use the email-poller.js (Phase 1) which calls
> OpenAI for extraction. This flow is best when emails follow a
> template or form submission format.

##### Step 2b — Condition: HTTP Succeeded?

| Setting | Value |
|---------|-------|
| **Condition** | `outputs('HTTP')?['statusCode']` is equal to 201 |

**If Yes:**

##### Step 2c — Mark Email as Read

| Setting | Value |
|---------|-------|
| **Connector** | Office 365 Outlook |
| **Action** | "Update email (V2)" |
| **Message ID** | `items('Apply_to_each')?['id']` |
| **Is Read** | Yes |

**If No:**

##### Step 2d — Log Error (optional)

| Setting | Value |
|---------|-------|
| **Connector** | Office 365 Outlook |
| **Action** | "Send an email (V2)" |
| **To** | `pat@cheekytees.com` |
| **Subject** | `⚠️ Email intake failed` |
| **Body** | `Email from: @{items('Apply_to_each')?['from']}\nSubject: @{items('Apply_to_each')?['subject']}\nHTTP Status: @{outputs('HTTP')?['statusCode']}` |

---

## Environment Variables Required

| Variable | Used By | Description |
|----------|---------|-------------|
| `DATAVERSE_URL` | Flow 1 trigger | Dataverse org URL |
| `WEBHOOK_SECRET` | Flow 2, Step 2a | Auth header for POST /intake |
| `OUTLOOK_USER_EMAIL` | Flow 2 | Mailbox to monitor |

---

## Setup Checklist

### Flow 1 (Order Confirmation)
- [ ] Create flow in Power Automate
- [ ] Configure Dataverse connection (use service account)
- [ ] Set up Teams channel (#orders)
- [ ] Create Planner plan + "New Orders" bucket
- [ ] Configure Outlook shared mailbox
- [ ] Test with a manual order: `node intake.js`
- [ ] Verify: email sent, Teams message posted, Planner task created

### Flow 2 (Email Intake)
- [ ] Create flow in Power Automate
- [ ] Decide: use this flow OR email-poller.js (not both)
- [ ] Configure webhook URL (localhost for dev, deployed URL for prod)
- [ ] Set WEBHOOK_SECRET in .env and flow headers
- [ ] Test: send email to monitored mailbox → verify order created

---

## Architecture Decision: email-poller.js vs Flow 2

| Factor | email-poller.js (Node.js) | Flow 2 (Power Automate) |
|--------|---------------------------|-------------------------|
| OpenAI extraction | ✅ Yes (parses raw emails) | ❌ No (needs pre-structured JSON) |
| Runs where | Your server / local machine | Microsoft cloud |
| Cost | Free (your compute) | Power Automate license |
| Reliability | Depends on uptime | Microsoft-managed |
| Best for | Raw customer emails | Template/form submissions |

**Recommendation:** Use `email-poller.js` for production (handles unstructured
emails via OpenAI). Use Flow 2 as a backup or for structured form submissions.
