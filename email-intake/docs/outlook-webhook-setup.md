# Outlook webhook (Power Automate)

## 1 — What you are building

You are adding a **single HTTP endpoint** that Cheeky OS calls with JSON (`to`, `subject`, `body`). Power Automate receives that JSON and **sends the email through Outlook** using your Microsoft 365 connection.

## 2 — Step by step

1. Go to [Power Automate](https://make.powerautomate.com).
2. Click **Create**.
3. Select **Automated cloud flow** (or **Instant cloud flow** with the HTTP trigger, depending on your UI).
4. Choose trigger **When an HTTP request is received**.
5. Add action **Send an email (V2)** (Office 365 Outlook).

## 3 — Exact field values

In **Send an email (V2)**:

**To**

```text
@{triggerBody()?['to']}
```

**Subject**

```text
@{triggerBody()?['subject']}
```

**Body**

```text
@{triggerBody()?['body']}
```

(Optional) Map **CC** / **BCC** the same way if you add those fields to the flow later.

## 4 — Sample payload

Cheeky OS sends JSON like:

```json
{
  "to": "your@email.com",
  "subject": "Test Email",
  "body": "Hello from Cheeky OS"
}
```

## 5 — Get webhook URL

1. **Save** the flow.
2. Open the **When an HTTP request is received** trigger and copy the **HTTP POST URL**.
3. Put it in your Cheeky OS `.env`:

```env
POWER_AUTOMATE_OUTLOOK_WEBHOOK=https://...your-flow-url...
```

(Optional) Set a default mailbox for tests without a parsed recipient:

```env
DEFAULT_FROM_EMAIL=your@email.com
```

## 6 — Final check

1. Restart the API server so it reloads `.env`.
2. Run:

   `node scripts/testLiveCommand.js`

   or POST `{"input":"send test email hello from cheeky os"}` to `/api/command`.
3. Confirm the email arrives in the inbox you used for **To** (or your default address).

If `POWER_AUTOMATE_OUTLOOK_WEBHOOK` is missing, Cheeky OS stays in **stub mode** (no HTTP call) and logs that Outlook is not configured.
