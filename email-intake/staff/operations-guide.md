# Cheeky Tees — Operations Guide

> **For:** Employee #1
> **Written by:** Pat Cox
> **Last Updated:** Phase 14

---

## 1. Welcome to Cheeky Tees

Welcome aboard! Cheeky Tees is a custom apparel shop in Fountain Inn, South Carolina. We print and decorate clothing for businesses, sports teams, churches, schools, events — anyone who needs custom gear.

**What we make:**
- Custom t-shirts, hoodies, jerseys, polos, hats, jackets, tank tops, and more

**How we make it:**
- Screen printing — the classic method, great for large runs
- DTG (Direct to Garment) — like an inkjet printer for shirts, great for small runs and full-color designs
- DTF (Direct to Film) — transfers we press onto garments
- Full sublimation — all-over prints, great for jerseys
- Embroidery — stitched logos and text
- Vinyl / HTV — heat-pressed cut designs

**What a typical day looks like:**
1. Check the dashboard — see what orders are in the queue
2. Review any new orders that came in overnight (email or website)
3. Work through production stages: received → art → printing → finished → shipped
4. Handle customer questions as they come in
5. Mark orders complete and update tracking

---

## 2. Your Tools

### The Dashboard

This is your main screen. It shows every order in the system, color-coded by stage.

**How to open it:** Open your browser and go to the dashboard URL Pat gives you (usually `http://localhost:3000` or a network address).

**What you'll see:**
- **Green dot** at top = system is running normally
- **Red dot** = something is wrong — tell Pat
- **Summary cards** = quick counts of active, due today, overdue, and completed orders
- **Color-coded table** = all orders with their current stage

### Email

Customer order requests come in through Outlook. Most are processed automatically by the system. You don't need to manually enter orders that come by email — the system reads them, extracts the details, and creates the order automatically.

**What to watch for:** Emails that look like orders but weren't picked up by the system. If you see one in the inbox that doesn't show up in the dashboard within 10 minutes, flag it for Pat.

### Square

Square handles our invoicing. When an order is created, the system automatically:
1. Finds or creates the customer in Square
2. Creates a draft invoice

You don't need to manually create invoices unless the system missed one. Pat will show you how to check Square if needed.

### Teams

Microsoft Teams is where system alerts go. If the dashboard goes red or the system has a problem, a message is posted to the Teams channel automatically. Keep Teams open so you see alerts.

---

## 3. Daily Opening Checklist

Do these steps every morning when you start:

1. **Open the dashboard** in your browser
2. **Check the status dot** in the top-right corner — it should be **green**
   - If it's **red**, check if the server is running. If you can't fix it, text Pat.
3. **Look at the summary cards** — note how many orders are active and if any are overdue
4. **Review orders due today** — sort the table by "Due Date" (click the column header)
5. **Check for new emails** — open Outlook and look at the inbox. New order emails should already be in the dashboard. If any aren't, flag them.
6. **Check overdue orders** — overdue rows are highlighted in red. If any are overdue, check what stage they're in and whether we need to prioritize them.
7. **Flag anything unusual for Pat** — if something doesn't look right, send Pat a text

---

## 4. Processing an Order

### What Happens Automatically

When a customer sends an order email or submits through the website:

1. ✅ The system reads the email and extracts order details (customer name, product, quantity, print type, sizes, deadline)
2. ✅ The order is saved to our database (Dataverse)
3. ✅ A labor tracking record is created
4. ✅ The customer is created/found in Square
5. ✅ A draft invoice is created in Square

**You don't need to do any of the above.** It happens automatically.

### What Needs Human Eyes

**Stage: Received → Art**
- Check that the order details look correct in the dashboard
- Make sure we have the artwork file or know what design the customer wants
- If art is missing, contact the customer
- When art is ready, update the stage to "Art"

**Stage: Art → Printing**
- Confirm the art proof was approved by the customer
- Check that we have the blank garments in stock
- When ready to print, update the stage to "Printing"

**Stage: Printing → Finished**
- Do the actual printing/decoration
- Quality check the finished product
- When done, update the stage to "Finished"

**Stage: Finished → Shipped**
- Package the order
- Arrange shipping or notify customer for pickup
- Mark as "Shipped" in the dashboard (use the 📦 Mark Shipped button)

---

## 5. Handling Exceptions

### "An order came in but it's not in the dashboard"

1. Check if the email is in the Outlook inbox
2. Wait 10 minutes — sometimes there's a small delay
3. If it still doesn't appear, the system may not have recognized the email as an order
4. Text Pat — he can manually enter it or check the logs

### "A customer is asking about their order status"

1. Open the dashboard
2. Search for the customer name or order ID using the search bar
3. Tell the customer what stage their order is in:
   - **Received** = "We've got your order and it's in our queue"
   - **Art** = "We're working on the design/artwork"
   - **Printing** = "Your order is being printed right now"
   - **Finished** = "Your order is done and ready for shipping"
   - **Shipped** = "Your order has shipped"

### "A Square invoice wasn't sent"

1. Don't worry — this doesn't affect the order itself
2. The order is still in the system and production continues
3. Text Pat — he'll check Square manually or re-send the invoice

### "The dashboard shows red / system is offline"

1. Don't panic — orders already in the system are safe
2. Check if your internet connection is working
3. Try refreshing the dashboard (click the ↻ Refresh button)
4. If it stays red for more than 5 minutes, text Pat
5. You can still process physical orders — just note them on paper and Pat will enter them later

### "I'm not sure — should I handle it or tell Pat?"

**Handle it yourself:**
- Customer asking for order status → look it up in the dashboard
- Marking an order as shipped → use the dashboard button
- Customer asking for a tracking number → check with the shipping carrier

**Text Pat:**
- System is offline for more than 5 minutes
- An order seems wrong or duplicate
- A customer is upset or making a complaint
- You see error messages you don't understand
- Something looks different from usual

---

## 6. End of Day

Before you leave for the day:

1. **Mark completed orders as shipped** — use the 📦 Mark Shipped button for any orders that went out today
2. **Export daily CSV** — click the ⬇ Export CSV button to download today's queue snapshot
3. **Check for overdue orders** — if any are still red/overdue, note them for Pat
4. **Send Pat a quick summary** — text him: "X orders shipped today, Y still in queue, any issues flagged"

---

## 7. Contacts and Escalation

### Pat Cox (Owner)

- **When to contact:** System issues, customer complaints, order problems, anything you're unsure about
- **How:** Text message is fastest
- **Phone:** *(Pat will fill in)*
- **Email:** *(Pat will fill in)*

### Response Times

| Situation | Action | Urgency |
|-----------|--------|---------|
| Customer asking order status | Look up and respond | Handle yourself |
| Order needs stage update | Update in dashboard | Handle yourself |
| Customer wants to change order | Note it and tell Pat | Text Pat today |
| System offline > 5 min | Text Pat | Text Pat now |
| Customer complaint | Apologize, note details, tell Pat | Text Pat now |
| Something broke / looks wrong | Don't touch it, tell Pat | Text Pat now |
| New feature idea or suggestion | Note it for Pat | Can wait |
