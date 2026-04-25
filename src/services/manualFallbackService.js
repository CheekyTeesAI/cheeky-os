/**
 * Human procedures when automation/provider is degraded.
 */
function getManualFallbackMap() {
  return [
    {
      subsystem: "SMS",
      status: "DEGRADED",
      manualFallback: "Use approved email, phone call, or text from the shop line; log in timeline via POST /inbound/sms if needed.",
    },
    {
      subsystem: "outbound_email",
      status: "DEGRADED",
      manualFallback: "Copy drafts from communications preview; send from approved mailbox only.",
    },
    {
      subsystem: "vendor_outbound",
      status: "PREVIEW_FIRST",
      manualFallback: "Download PO PDF, email supplier from tracked mailbox; confirm in vendor dashboard.",
    },
    {
      subsystem: "square",
      status: "MOCK",
      manualFallback: "Use Square Dashboard for payments until token validates; do not trust mock invoice list for cash decisions.",
    },
    {
      subsystem: "inbound_email",
      status: "DEGRADED",
      manualFallback: "Forward or paste customer emails into POST /inbound/email until webhooks/Graph are live.",
    },
    {
      subsystem: "social_content",
      status: "MANUAL",
      manualFallback: "Approve posts in /content flow; auto-post only when explicitly enabled.",
    },
  ];
}

module.exports = { getManualFallbackMap };
