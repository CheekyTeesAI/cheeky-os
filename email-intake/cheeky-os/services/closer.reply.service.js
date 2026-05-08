"use strict";

/**
 * PHASE 4 — Customer reply drafts (operator must approve before any send).
 */

function extractNameForReply(message) {
  if (message.matchedCustomerName && String(message.matchedCustomerName).trim()) {
    return String(message.matchedCustomerName).trim().split(" ")[0];
  }
  const from = String(message.from || "").trim();
  const m = from.match(/^(.+?)\s*</);
  if (m && m[1]) return m[1].replace(/["']/g, "").trim().split(" ")[0];
  return "there";
}

function cleanSubjectForReply(subject) {
  const s = String(subject || "Cheeky Tees").replace(/^(re:\s*)+/gi, "").trim();
  return s || "Cheeky Tees";
}

function buildReplyDraft({ message, classification, orderDetails, nextAction }) {
  try {
    const customerName = extractNameForReply(message);
    const subj = cleanSubjectForReply(message.subject);

    if (classification === "quote_request" || classification === "order_interest") {
      return {
        subject: `Re: ${subj}`,
        body:
`Hey ${customerName},

Thanks for reaching out — we can help with this.

To get this quoted accurately, can you confirm:
1. Quantity
2. Shirt style/color
3. Print location
4. Needed-by date
5. Whether you already have artwork ready

Once I have that, I can get pricing together and move this forward.

Thanks,
Cheeky Tees`,
      };
    }

    if (classification === "payment_ready") {
      return {
        subject: `Re: ${subj}`,
        body:
`Hey ${customerName},

Thanks for following up. I'll confirm the invoice/payment status and send the correct next step shortly.

Thanks,
Cheeky Tees`,
      };
    }

    if (classification === "status_request") {
      return {
        subject: `Re: ${subj}`,
        body:
`Hey ${customerName},

Thanks for checking in. I'll verify the current production status and follow up with an accurate update shortly.

Thanks,
Cheeky Tees`,
      };
    }

    return {
      subject: `Re: ${subj}`,
      body:
`Hey ${customerName},

Thanks for getting back to us. I'll review this and follow up shortly.

Thanks,
Cheeky Tees`,
    };
  } catch (_) {
    return {
      subject: "Re: Cheeky Tees",
      body: "Thanks for your message. We'll review and follow up shortly.\n\nThanks,\nCheeky Tees",
    };
  }
}

module.exports = { buildReplyDraft };
