# CHEEKY RIE REPORT — 4/25/2026, 12:05:36 AM

## SUMMARY
- Total files scanned: 1645
- JS files with Express routes: 200
- Total endpoints mapped: 641
- Service files: 343
- Unused services: 1
- Files with stubs/TODOs: 3

## DISCONNECTED SYSTEMS
- Square wired to Orders:     YES
- Email feeding pipeline:     YES
- Follow-up cron active:      YES
- Webhook payment guard:      YES
- Audit trail present:        YES
- Deposit + Followup linked:  YES
- Cash snapshot active:       YES
- Decision engine wired:      YES

## CASH-CRITICAL ENDPOINTS (175)
- GET /api/orders/export [\email-intake\api\orders-export.js]
- GET /api/orders/health [\email-intake\api\orders-export.js]
- GET /api/production/next [\email-intake\api\orders-export.js]
- GET /api/production/tasks [\email-intake\api\orders-export.js]
- GET /api/dashboard [\email-intake\api\orders-export.js]
- GET /api/orders/decision [\email-intake\api\orders-export.js]
- GET /api/orders/followups [\email-intake\api\orders-export.js]
- POST /api/orders/send-followups [\email-intake\api\orders-export.js]
- POST /api/orders/create-invoice [\email-intake\api\orders-export.js]
- POST /api/orders/auto-invoice [\email-intake\api\orders-export.js]
- POST /api/cheeky/run-all [\email-intake\api\orders-export.js]
- POST /api/square/webhook [\email-intake\api\orders-export.js]
- POST /api/voice/command [\email-intake\api\orders-export.js]
- GET /api/mobile/command-center [\email-intake\api\orders-export.js]
- POST /api/intake/auto-order [\email-intake\api\orders-export.js]
- POST /api/intake/create-order [\email-intake\api\orders-export.js]
- GET /api/owner/dashboard [\email-intake\api\orders-export.js]
- POST /api/owner/run [\email-intake\api\orders-export.js]
- POST /api/ai/control [\email-intake\api\orders-export.js]
- POST /convert-to-order [\email-intake\cheeky-os\routes\capture.js]
- GET /priorities [\email-intake\cheeky-os\routes\cash.js]
- GET /deposits [\email-intake\cheeky-os\routes\cash.js]
- POST /blitz [\email-intake\cheeky-os\routes\cashBlitz.js]
- GET /deposits-needed [\email-intake\cheeky-os\routes\comms.js]
- POST /send-deposit-reminder [\email-intake\cheeky-os\routes\comms.js]
- POST /followups [\email-intake\cheeky-os\routes\control.js]
- GET /test-followups [\email-intake\cheeky-os\routes\control.js]
- POST /quote [\email-intake\cheeky-os\routes\control.js]
- POST /leads [\email-intake\cheeky-os\routes\control.js]
- GET /test-leads [\email-intake\cheeky-os\routes\control.js]
- POST /invoice [\email-intake\cheeky-os\routes\control.js]
- POST /followup2/run [\email-intake\cheeky-os\routes\control.js]
- GET /followup2/hot [\email-intake\cheeky-os\routes\control.js]
- GET /followup2/next [\email-intake\cheeky-os\routes\control.js]
- POST /payments/sync [\email-intake\cheeky-os\routes\control.js]
- GET /payments/open [\email-intake\cheeky-os\routes\control.js]
- GET /payments/paid [\email-intake\cheeky-os\routes\control.js]
- POST /payment [\email-intake\cheeky-os\routes\data.js]
- GET /deposit-followups [\email-intake\cheeky-os\routes\depositFollowups.js]
- GET / [\email-intake\cheeky-os\routes\followup2.js]
- POST /track [\email-intake\cheeky-os\routes\followup2.js]
- GET /open [\email-intake\cheeky-os\routes\followup2.js]
- GET /stale [\email-intake\cheeky-os\routes\followup2.js]
- GET /hot [\email-intake\cheeky-os\routes\followup2.js]
- POST /run [\email-intake\cheeky-os\routes\followup2.js]
- GET /next [\email-intake\cheeky-os\routes\followup2.js]
- POST /mark-paid [\email-intake\cheeky-os\routes\followup2.js]
- POST /mark [\email-intake\cheeky-os\routes\followup2.js]
- GET /test-run [\email-intake\cheeky-os\routes\followup2.js]
- GET /test-track [\email-intake\cheeky-os\routes\followup2.js]
- GET /test-mark [\email-intake\cheeky-os\routes\followup2.js]
- GET /debug-run [\email-intake\cheeky-os\routes\followup2.js]
- GET /garment-orders [\email-intake\cheeky-os\routes\garmentOperatorList.js]
- POST /:id/garments/mark-ordered [\email-intake\cheeky-os\routes\garmentOrderMark.js]
- POST /:id/garments/mark-received [\email-intake\cheeky-os\routes\garmentOrderMark.js]
- POST /create [\email-intake\cheeky-os\routes\invoice.js]
- POST /from-quote [\email-intake\cheeky-os\routes\invoice.js]
- POST /capture [\email-intake\cheeky-os\routes\leads.js]
- GET /recent [\email-intake\cheeky-os\routes\leads.js]
- POST /respond [\email-intake\cheeky-os\routes\leads.js]
- POST /convert [\email-intake\cheeky-os\routes\leads.js]
- POST /cash/refresh [\email-intake\cheeky-os\routes\memory.js]
- POST /:id/files/link [\email-intake\cheeky-os\routes\orderFiles.js]
- POST /create-from-capture [\email-intake\cheeky-os\routes\ordersCapture.js]
- POST /generate-tasks [\email-intake\cheeky-os\routes\ordersCapture.js]
- GET /intelligence/:orderId [\email-intake\cheeky-os\routes\ordersIntelligence.js]
- POST /add-note [\email-intake\cheeky-os\routes\ordersMemory.js]
- POST /add-decision [\email-intake\cheeky-os\routes\ordersMemory.js]
- POST /update-status [\email-intake\cheeky-os\routes\ordersStatus.js]
- GET /sync [\email-intake\cheeky-os\routes\payments.js]
- GET /status/:invoiceId [\email-intake\cheeky-os\routes\payments.js]
- POST /webhook [\email-intake\cheeky-os\routes\payments.js]
- GET /open [\email-intake\cheeky-os\routes\payments.js]
- GET /paid [\email-intake\cheeky-os\routes\payments.js]
- GET /test [\email-intake\cheeky-os\routes\payments.js]
- POST /calculate [\email-intake\cheeky-os\routes\quotes.js]
- GET /rules [\email-intake\cheeky-os\routes\quotes.js]
- POST /auto-invoice [\email-intake\cheeky-os\routes\responses.js]
- GET /followups [\email-intake\cheeky-os\routes\revenue.js]
- GET /auto-followups [\email-intake\cheeky-os\routes\revenue.js]
- POST /create-draft-invoice [\email-intake\cheeky-os\routes\squareDraft.js]
- GET /ready [\email-intake\cheeky-os\routes\workOrders.js]
- POST /generate [\email-intake\cheeky-os\routes\workOrders.js]
- POST /:orderId/mark-printed [\email-intake\cheeky-os\routes\workOrders.js]
- GET /:orderId/print [\email-intake\cheeky-os\routes\workOrders.js]
- GET /:orderId [\email-intake\cheeky-os\routes\workOrders.js]
- GET /orders/new [\email-intake\cheeky-os\server.js]
- GET /start-order [\email-intake\cheeky-os\server.js]
- GET /leads [\email-intake\cheeky-os\server.js]
- GET /money-engine/health [\email-intake\cheeky-os\server.js]
- GET /api/cash/health [\email-intake\cheeky-os\src\routes\cash.route.js]
- GET /api/cash/snapshot [\email-intake\cheeky-os\src\routes\cash.route.js]
- GET /api/cash/obligations [\email-intake\cheeky-os\src\routes\cash.route.js]
- GET /api/cash/runway [\email-intake\cheeky-os\src\routes\cash.route.js]
- GET /api/cash/priorities [\email-intake\cheeky-os\src\routes\cash.route.js]
- POST /api/cash/run [\email-intake\cheeky-os\src\routes\cash.route.js]
- GET /api/cash/explain [\email-intake\cheeky-os\src\routes\cash.route.js]
- GET /api/chatgpt/payments [\email-intake\cheeky-os\src\routes\chatgpt.route.js]
- GET /api/chatgpt/cash/snapshot [\email-intake\cheeky-os\src\routes\chatgpt.route.js]
- GET /api/chatgpt/cash/runway [\email-intake\cheeky-os\src\routes\chatgpt.route.js]
- GET /api/chatgpt/cash/priorities [\email-intake\cheeky-os\src\routes\chatgpt.route.js]
- POST /api/chatgpt/actions/mark-blanks-ordered [\email-intake\cheeky-os\src\routes\chatgpt.route.js]
- POST /api/chatgpt/actions/create-draft-invoice-request [\email-intake\cheeky-os\src\routes\chatgpt.route.js]
- GET /api/operator/followups/status [\email-intake\cheeky-os\src\routes\followupsStatus.route.js]
- GET /api/operator/followups/queue [\email-intake\cheeky-os\src\routes\followupsStatus.route.js]
- GET /api/operator/followups/audit [\email-intake\cheeky-os\src\routes\followupsStatus.route.js]
- POST /api/lead [\email-intake\cheeky-os\src\routes\lead.route.js]
- GET /api/operator/payments [\email-intake\cheeky-os\src\routes\payment.route.js]
- POST /api/operator/payments/:id/mark-paid [\email-intake\cheeky-os\src\routes\payment.route.js]
- GET /api/operator/payment-status [\email-intake\cheeky-os\src\routes\paymentStatus.route.js]
- POST /api/operator/release/:id/mark-blanks-ordered [\email-intake\cheeky-os\src\routes\release.route.js]
- POST /api/square/payment-sync [\email-intake\cheeky-os\src\routes\squarePaymentSync.route.js]
- POST /outreach/followup-run [\email-intake\src\routes\outreach.followup.js]
- POST /square [\email-intake\src\webhooks\squareWebhook.js]
- POST /square/payment [\email-intake\src\webhooks\squareWebhook.js]
- POST /:orderId/art/attach [\src\routes\art.js]
- POST /api/art/:orderId/create [\src\routes\art.queue.js]
- GET / [\src\routes\cashflow.js]
- POST /api/communications/deposit/:orderId [\src\routes\communications.js]
- POST /api/communications/pickup/:orderId [\src\routes\communications.js]
- POST /api/communications/status/:orderId [\src\routes\communications.js]
- GET /api/customers/:key/orders [\src\routes\customers.history.js]
- POST /api/orders/:id/reorder [\src\routes\customers.history.js]
- GET /square/invoices [\src\routes\dataSquare.js]
- POST /auto-from-order/:orderId [\src\routes\estimates.auto.js]
- POST /send/:orderId [\src\routes\followup.actions.js]
- POST /done/:orderId [\src\routes\followup.actions.js]
- GET /run [\src\routes\followups.js]
- GET /api/garments/to-order [\src\routes\garment.orders.js]
- POST /api/garments/order/:orderId [\src\routes\garment.orders.js]
- POST /:orderId/garments/order [\src\routes\garments.js]
- POST /:orderId/garments/received [\src\routes\garments.js]
- POST /:orderId/production/complete [\src\routes\garments.js]
- POST /:orderId/qc/complete [\src\routes\garments.js]
- POST /api/garments/:jobId/order [\src\routes\garments.v63.js]
- POST /order/:id [\src\routes\garmentsShort.js]
- POST /:id/convert-quote [\src\routes\intake.js]
- POST /api/leads [\src\routes\leads.js]
- GET /api/leads [\src\routes\leads.js]
- GET /api/leads/followups [\src\routes\leads.js]
- POST /api/leads/:id/contacted [\src\routes\leads.js]
- POST /api/leads/:id/followup [\src\routes\leads.js]
- POST /api/leads/:id/convert [\src\routes\leads.js]
- POST /quick [\src\routes\orders.js]
- GET / [\src\routes\orders.js]
- POST /:id/deposit-paid [\src\routes\orders.js]
- POST /:id/advance-smart [\src\routes\orders.js]
- GET / [\src\routes\payments.js]
- POST /deposit [\src\routes\payments.js]
- POST /api/print/complete/:orderId [\src\routes\print.actions.js]
- POST /api/quotes/:orderId/create [\src\routes\quotes.js]
- POST /api/quotes/:id/accept [\src\routes\quotes.js]
- GET /api/quotes [\src\routes\quotes.js]
- POST /run [\src\routes\revenue.followups.js]
- GET /opportunities [\src\routes\revenue.followups.js]
- POST /recent [\src\routes\square.import.js]
- POST /by-id [\src\routes\square.import.js]
- GET /status/:invoiceId [\src\routes\square.status.js]
- POST /webhooks/square [\src\routes\square.webhook.js]
- GET /status [\src\routes\squareTruth.js]
- GET /sync [\src\routes\squareTruth.js]
- GET /invoices [\src\routes\squareTruth.js]
- GET /estimates [\src\routes\squareTruth.js]
- GET /payments [\src\routes\squareTruth.js]
- GET /reconcile [\src\routes\squareTruth.js]
- POST /quote/preview [\src\routes\squareTruth.js]
- POST /quote/create [\src\routes\squareTruth.js]
- POST /invoice/preview [\src\routes\squareTruth.js]
- POST /invoice/create [\src\routes\squareTruth.js]
- GET /dashboard [\src\routes\squareTruth.js]
- GET /api/workorders/:jobId [\src\routes\workorders.js]
- POST /api/workorders/:jobId/create [\src\routes\workorders.js]
- GET /api/workorders [\src\routes\workorders.js]
- GET /:id/job-packet [\src\routes\workorders.js]
- POST /square/webhook [\src\webhooks\squareWebhook.js]

## HIGH VALUE — FINISH NOW (score >= 10): 37 items
1. [Score: 13] \email-intake\api\orders-export.js
   Type: route

2. [Score: 13] \email-intake\api\orders-export.js
   Type: route

3. [Score: 13] \email-intake\api\orders-export.js
   Type: route

4. [Score: 13] \email-intake\api\orders-export.js
   Type: route

5. [Score: 13] \email-intake\api\orders-export.js
   Type: route

6. [Score: 13] \email-intake\cheeky-os\routes\cash.js
   Type: route

7. [Score: 13] \email-intake\cheeky-os\routes\depositFollowups.js
   Type: route

8. [Score: 13] \email-intake\cheeky-os\routes\invoice.js
   Type: route

9. [Score: 13] \email-intake\cheeky-os\routes\payments.js
   Type: route

10. [Score: 13] \email-intake\cheeky-os\routes\revenue.js
   Type: route

11. [Score: 13] \email-intake\cheeky-os\routes\revenue.js
   Type: route

12. [Score: 13] \email-intake\cheeky-os\routes\squareDraft.js
   Type: route

13. [Score: 13] \email-intake\cheeky-os\src\routes\squarePaymentSync.route.js
   Type: route

14. [Score: 13] \email-intake\src\webhooks\squareWebhook.js
   Type: route

15. [Score: 13] \src\routes\communications.js
   Type: route

16. [Score: 13] \src\routes\dataSquare.js
   Type: route

17. [Score: 13] \src\routes\followup.actions.js
   Type: route

18. [Score: 13] \src\routes\followup.actions.js
   Type: route

19. [Score: 13] \src\routes\leads.js
   Type: route

20. [Score: 13] \src\routes\leads.js
   Type: route

21. [Score: 13] \src\routes\orders.js
   Type: route

22. [Score: 13] \src\routes\payments.js
   Type: route

23. [Score: 13] \src\routes\quotes.js
   Type: route

24. [Score: 13] \src\routes\revenue.followups.js
   Type: route

25. [Score: 13] \src\routes\revenue.followups.js
   Type: route

26. [Score: 13] \src\routes\square.status.js
   Type: route

27. [Score: 13] \src\routes\squareTruth.js
   Type: route

28. [Score: 13] \src\routes\squareTruth.js
   Type: route

29. [Score: 13] \src\routes\squareTruth.js
   Type: route

30. [Score: 13] \src\routes\squareTruth.js
   Type: route

## MEDIUM VALUE — SCHEDULE SOON (score 5-9): 208 items
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\api\orders-export.js
- [Score: 8] \email-intake\cheeky-os\routes\capture.js
- [Score: 8] \email-intake\cheeky-os\routes\cash.js
- [Score: 8] \email-intake\cheeky-os\routes\cashBlitz.js
- [Score: 8] \email-intake\cheeky-os\routes\comms.js
- [Score: 8] \email-intake\cheeky-os\routes\comms.js
- [Score: 8] \email-intake\cheeky-os\routes\control.js

## LOW VALUE — IGNORE FOR NOW: 742 items (omitted)

## STUBS DETECTED
- [1 hits] \email-intake\cheeky-os\src\operator\moneyEngine.js
- [6 hits] \tools\repo-intelligence\analyzers\stubs.js
- [2 hits] \tools\repo-intelligence\run.js
