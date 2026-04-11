# Cheeky OS — Pre-Launch Checklist

> **Go / No-Go Checklist** for taking the first real customer order through the system.
> Every box must be checked before going live.

---

## ✅ CREDENTIALS (must all be green)

- [ ] `DATAVERSE_URL` set and auth token fetch succeeds
- [ ] `DATAVERSE_TENANT_ID` set (same as `AZURE_TENANT_ID`)
- [ ] `DATAVERSE_CLIENT_ID` set (same as `AZURE_CLIENT_ID`)
- [ ] `DATAVERSE_CLIENT_SECRET` set (same as `AZURE_CLIENT_SECRET`)
- [ ] `OUTLOOK_USER_EMAIL` set and inbox is accessible via Graph API
- [ ] `AZURE_TENANT_ID` set
- [ ] `AZURE_CLIENT_ID` set
- [ ] `AZURE_CLIENT_SECRET` set
- [ ] `OPENAI_API_KEY` set and responding to test prompts
- [ ] `SQUARE_ACCESS_TOKEN` set — **switch to production** (not sandbox)
- [ ] `SQUARE_LOCATION_ID` set and verified against the production account
- [ ] `SQUARE_ENVIRONMENT` set to `production`
- [ ] `TEAMS_WEBHOOK_URL` set and posting test messages to the alert channel

---

## ✅ SYSTEM (must all be green)

Run each of these commands and confirm all pass:

- [ ] `node scripts/verify-credentials.js` — **6/6 passing**
- [ ] `node scripts/simulate-order.js` — **6/6 passing**
- [ ] `node tests/test-runner.js --all` — **all suites passing**
- [ ] `node dataverse/column-check.js` — **no missing columns** reported
- [ ] `node start.js` — webhook server + email poller both confirm "STARTED"
- [ ] Dashboard opens in browser at `http://localhost:3000` and shows **green** status dot
- [ ] Teams channel received the health check message from `verify-credentials.js`

---

## ✅ DATA (must all be green)

- [ ] Dataverse `ct_orderses` table has all required columns (verify with `column-check.js`)
- [ ] Dataverse `ct_laborrecords` table exists and is linked to `ct_orderses`
- [ ] Square location confirmed — matches `SQUARE_LOCATION_ID`
- [ ] Test invoice created and visible in Square (sandbox first, then production)

---

## ✅ FIRST ORDER PROTOCOL

Run this sequence end-to-end with a real test email:

1. - [ ] Send a test order email to the Outlook inbox (e.g., "I need 24 DTG t-shirts by Friday")
2. - [ ] Confirm email-poller picks it up within 5 minutes (check server logs or dashboard)
3. - [ ] Confirm a Dataverse record was created (check Power Apps or column-check.js)
4. - [ ] Confirm a Square invoice was created (check Square Dashboard → Invoices)
5. - [ ] Confirm the dashboard shows the new order (refresh the Production Queue)
6. - [ ] Confirm a Teams notification was received in the alert channel
7. - [ ] Mark the test order as shipped using the 📦 button in the dashboard
8. - [ ] Confirm the `POST /production-update` endpoint responded successfully

---

## 🚦 GO / NO-GO DECISION

| Condition | Decision |
|-----------|----------|
| All boxes above are checked | ✅ **GO** — system is ready for live orders |
| Any credential is missing or failing | 🛑 **NO-GO** — fix credentials first (see `scripts/credential-setup-guide.md`) |
| Any test is failing | 🛑 **NO-GO** — fix test failures first |
| Email poller didn't pick up the test email | 🛑 **NO-GO** — check Graph API permissions |
| Square invoice wasn't created | 🛑 **NO-GO** — check Square token and environment |
| Dashboard shows red status | 🛑 **NO-GO** — check webhook server is running |

---

## 📋 After Going Live

Once the first real order succeeds:

1. Run `node scripts/simulate-order.js` one final time to confirm all 6/6
2. Export the first day's data via the dashboard CSV export
3. Monitor the Teams channel for any error alerts
4. Check `logs/intake.log` and `logs/webhook.log` at end of day for anomalies
5. Back up the `.env` file somewhere safe (not in git!)
6. Celebrate 🎉
