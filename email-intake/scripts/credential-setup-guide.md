# Cheeky OS — Credential Setup Guide

> Step-by-step instructions for setting up every credential in your `.env` file.
> Written for someone who has never used Azure Portal, Square Dashboard, or OpenAI before.
> Follow each section in order.

---

## Before You Start

1. Open the file `email-intake/.env.example` in a text editor (Notepad, VS Code, etc.)
2. Save a copy as `email-intake/.env` (same folder, just remove ".example")
3. As you complete each section below, paste the values into your `.env` file
4. **Never share your `.env` file** — it contains secrets

---

## 1. Azure AD App Registration (For Dataverse + Graph API)

You need ONE app registration in Azure that covers both Dataverse access and Outlook/Graph API access.

### Step 1: Find Your Tenant ID

1. Go to [portal.azure.com](https://portal.azure.com) and sign in with your Microsoft 365 account
2. In the search bar at the top, type **"Tenant properties"** and click it
3. You'll see **Tenant ID** — it's a long string like `abc12345-def6-7890-ghij-klmnopqrstuv`
4. Copy it

**Paste into `.env`:**
```
AZURE_TENANT_ID=your-tenant-id-here
DATAVERSE_TENANT_ID=your-tenant-id-here
```
*(Yes, both variables get the same value — they're the same tenant)*

### Step 2: Register a New App

1. In Azure Portal, search for **"App registrations"** and click it
2. Click **"+ New registration"** at the top
3. Fill in:
   - **Name:** `Cheeky OS`
   - **Supported account types:** Select "Accounts in this organizational directory only"
   - **Redirect URI:** Leave blank (we don't need one)
4. Click **Register**
5. You'll see the app's **Application (client) ID** — copy it

**Paste into `.env`:**
```
AZURE_CLIENT_ID=your-client-id-here
DATAVERSE_CLIENT_ID=your-client-id-here
```
*(Again, both get the same value)*

### Step 3: Create a Client Secret

1. On your new app's page, click **"Certificates & secrets"** in the left menu
2. Click **"+ New client secret"**
3. Description: `Cheeky OS Production`
4. Expires: Choose **24 months** (you'll need to renew it before it expires)
5. Click **Add**
6. **IMMEDIATELY copy the "Value"** (not the "Secret ID") — you can only see it once!

**Paste into `.env`:**
```
AZURE_CLIENT_SECRET=your-secret-value-here
DATAVERSE_CLIENT_SECRET=your-secret-value-here
```

### Step 4: Grant Permissions

#### For Dataverse:

1. On your app's page, click **"API permissions"** in the left menu
2. Click **"+ Add a permission"**
3. Click **"Dynamics CRM"** (this is the Dataverse API)
4. Select **"Application permissions"**
5. Check **"user_impersonation"**
6. Click **Add permissions**
7. Click **"Grant admin consent for [your org]"** at the top — then click **Yes**

#### For Graph API (Outlook):

1. Still on API permissions, click **"+ Add a permission"** again
2. Click **"Microsoft Graph"**
3. Select **"Application permissions"**
4. Search for and check these:
   - **Mail.Read** — to read emails
   - **Mail.ReadWrite** — to mark emails as read
5. Click **Add permissions**
6. Click **"Grant admin consent"** again — then click **Yes**

You should now see green checkmarks next to all permissions.

### Step 5: Add Dataverse URL

1. Go to [make.powerapps.com](https://make.powerapps.com)
2. Click the **gear icon** (top right) → **Session details**
3. Look for **"Instance url"** — it looks like `https://org12345.crm.dynamics.com`
4. Copy it (include the `https://` but NOT any trailing slash)

**Paste into `.env`:**
```
DATAVERSE_URL=https://yourorg.crm.dynamics.com
```

### Step 6: Add Outlook Email

This is the email address the system will poll for new orders.

**Paste into `.env`:**
```
OUTLOOK_USER_EMAIL=pat@cheekytees.com
```
*(Use whatever email address receives customer orders)*

---

## 2. OpenAI API Key

The system uses OpenAI to read customer emails and extract order details.

### Step 1: Get Your API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign in (or create an account)
3. Click your profile icon (top right) → **"API keys"**
4. Click **"+ Create new secret key"**
5. Name: `Cheeky OS`
6. Click **Create**
7. **Copy the key immediately** — you can only see it once!

**Paste into `.env`:**
```
OPENAI_API_KEY=sk-your-key-here
```

### Important Notes

- **Model:** The system uses `gpt-4.1` by default. This is the recommended model for order extraction.
- **Cost:** Each email costs approximately $0.01-0.05 to process. A typical day with 10-20 orders costs less than $1.
- **Rate limits:** If you're on the free tier, you may hit rate limits. Upgrade to a paid plan if you're processing more than a few orders per day.
- **Billing:** Add a payment method at [platform.openai.com/account/billing](https://platform.openai.com/account/billing) and set a monthly spending limit.

---

## 3. Square API Credentials

Square handles customer management and invoicing.

### Step 1: Get Your Access Token

1. Go to [developer.squareup.com](https://developer.squareup.com)
2. Sign in with your Square account
3. Click **"+"** or **"Create Application"**
4. Name: `Cheeky OS`
5. Click the app you just created
6. You'll see two tabs: **Sandbox** and **Production**

**For testing (recommended first):**
- Click the **Sandbox** tab
- Copy the **Sandbox Access Token**

**For live orders (after testing works):**
- Click the **Production** tab
- Copy the **Production Access Token**

**Paste into `.env`:**
```
SQUARE_ACCESS_TOKEN=your-token-here
SQUARE_ENVIRONMENT=sandbox
```
*(Change to `production` when you're ready for real invoices)*

### Step 2: Find Your Location ID

1. On the same developer page, click **Locations** in the left menu
   - Or go to [developer.squareup.com/explorer](https://developer.squareup.com/explorer)
   - Select **Locations → List Locations**
   - Click **Run**
2. You'll see your location(s) listed with an **ID** like `L1234567890ABCDEF`
3. Copy the ID for your main location

**Paste into `.env`:**
```
SQUARE_LOCATION_ID=your-location-id-here
```

### Testing with Sandbox

When `SQUARE_ENVIRONMENT=sandbox`:
- No real money is charged
- No real invoices are created
- Customer records are stored in a separate sandbox
- You can safely test the entire flow
- Switch to `production` only after everything works in sandbox

---

## 4. Microsoft Teams Webhook

The health monitor sends alerts to Teams when the system goes down.

### Step 1: Create an Incoming Webhook

1. Open **Microsoft Teams** (desktop app or web)
2. Go to the channel where you want alerts (e.g., create a channel called **"Cheeky OS Alerts"**)
3. Click the **"..."** (more options) next to the channel name
4. Click **"Connectors"** (or **"Manage channel"** → **"Connectors"**)
5. Find **"Incoming Webhook"** and click **"Configure"**
   - If you don't see it, your Teams admin may need to enable it
6. Name: `Cheeky OS Health Monitor`
7. Upload an icon if you want (optional)
8. Click **Create**
9. **Copy the webhook URL** — it's a long URL starting with `https://`

**Paste into `.env`:**
```
TEAMS_WEBHOOK_URL=https://your-org.webhook.office.com/webhookb2/...
```

### Testing the Webhook

After setting the URL, run the credential check script:
```
node scripts/verify-credentials.js
```
You should see a test message appear in your Teams channel.

---

## 5. Webhook Server Port

This is the port your local server listens on. The default is 3000.

**Paste into `.env`:**
```
PORT=3000
```

Only change this if port 3000 is already in use by another application.

### Optional: Webhook Secret

If you want to require an authorization header on incoming webhook calls, set a secret:
```
WEBHOOK_SECRET=your-random-secret-here
```
Leave it empty to disable authentication (fine for local/internal use).

---

## 6. Complete .env File Example

Here's what your finished `.env` should look like (with your real values):

```env
# Dataverse
DATAVERSE_URL=https://yourorg.crm.dynamics.com
DATAVERSE_TENANT_ID=abc12345-def6-...
DATAVERSE_CLIENT_ID=def67890-abc1-...
DATAVERSE_CLIENT_SECRET=your-secret-here

# Azure / Graph API
AZURE_TENANT_ID=abc12345-def6-...
AZURE_CLIENT_ID=def67890-abc1-...
AZURE_CLIENT_SECRET=your-secret-here
OUTLOOK_USER_EMAIL=pat@cheekytees.com

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Square
SQUARE_ACCESS_TOKEN=your-token-here
SQUARE_LOCATION_ID=your-location-id
SQUARE_ENVIRONMENT=sandbox

# Webhook Server
PORT=3000
WEBHOOK_SECRET=

# Teams Alerts
TEAMS_WEBHOOK_URL=https://your-org.webhook.office.com/...
```

---

## 7. Verify Everything

After filling in all values, run:

```
cd email-intake
node scripts/verify-credentials.js
```

You should see:

```
  DATAVERSE      [ PASS ]
  GRAPH API      [ PASS ]
  OPENAI         [ PASS ]
  SQUARE         [ PASS ]
  TEAMS          [ PASS ]
  WEBHOOK        [ PASS ]

  TOTAL: 6/6 passing
```

If any check fails, re-read the section above for that service and verify your values are correct.

---

## 8. Push to GitHub

Once credentials are verified and the system is working:

1. Create a new repository on [github.com](https://github.com) (click **"+"** → **"New repository"**)
   - Name: `CheekyAPI`
   - Visibility: **Private** (recommended — this contains business logic)
   - Do NOT initialize with README (we already have one)
2. Copy the repository URL (it will look like `https://github.com/YourUsername/CheekyAPI.git`)
3. Open PowerShell in the `CheekyAPI` folder and run:

```powershell
git remote add origin https://github.com/YourUsername/CheekyAPI.git
git push -u origin main
```

4. If prompted, sign in with your GitHub credentials
5. Verify the push succeeded by checking github.com — you should see all your files

---

## Troubleshooting

### "Token request failed (401)"
- Double-check your client ID and client secret — they must match exactly
- Make sure admin consent was granted for all permissions
- The client secret may have expired — create a new one

### "Mail access failed (403)"
- The app needs Mail.Read and Mail.ReadWrite **application** permissions (not delegated)
- Admin consent must be granted
- Make sure the OUTLOOK_USER_EMAIL matches a real mailbox in your organization

### "OpenAI API call failed (401)"
- Your API key may be invalid or expired
- Check your billing — if your account has no payment method, the key won't work after the free credits run out

### "Square API call failed (401)"
- Make sure you're using the correct token for the environment (sandbox token for sandbox, production token for production)
- Tokens from the old API version don't work — use the v2 developer dashboard

### "Teams webhook failed"
- The webhook URL may have expired — recreate it in Teams
- Some organizations block incoming webhooks — check with your IT admin
