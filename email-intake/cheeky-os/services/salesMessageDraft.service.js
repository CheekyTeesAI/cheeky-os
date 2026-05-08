"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function fallbackPath() {
  return path.join(__dirname, "..", "..", "data", "sales-message-drafts.jsonl");
}

function appendFallbackLine(obj) {
  const p = fallbackPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(obj) + "\n", "utf8");
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * @param {object} item
 * @param {"QUOTE_FOLLOWUP"|"CHECK_IN"|"REACTIVATION"|"BULK_NUDGE"|"SEASONAL_CAMPAIGN"} item.type
 */
function buildBodies(item) {
  const name = String(item.customerName || item.customer || "there").trim() || "there";
  const typ = String(item.type || "QUOTE_FOLLOWUP").toUpperCase();
  let subject = "Cheeky — quick note";
  let text = "";

  switch (typ) {
    case "QUOTE_FOLLOWUP":
      subject = `Cheeky — your quote`;
      text =
        `Hi ${name},\n\n` +
        `Circling back on the quote we sent. If anything needs tweaking, say the word — when you're ready, we can lock the deposit and get your job on the calendar.\n\n` +
        `— Cheeky`;
      break;
    case "CHECK_IN":
      subject = `Cheeky — checking in`;
      text =
        `Hi ${name},\n\n` +
        `Quick check-in on where things landed on your end. No pressure — happy to answer questions or adjust scope.\n\n` +
        `— Cheeky`;
      break;
    case "REACTIVATION":
      subject = `Cheeky — been a minute`;
      text =
        `Hi ${name},\n\n` +
        `We've missed working with you. If you have a project coming up, we'd love to earn it — reply anytime and we'll make it easy.\n\n` +
        `— Cheeky`;
      break;
    case "BULK_NUDGE":
      subject = `Cheeky — your bigger run`;
      text =
        `Hi ${name},\n\n` +
        `For larger runs we like to line up deposits and blanks early so nothing slips. If you want to move forward, reply here and we'll confirm next steps.\n\n` +
        `— Cheeky`;
      break;
    case "SEASONAL_CAMPAIGN":
      subject = `Cheeky — planning your next run`;
      text =
        `Hi ${name},\n\n` +
        `We're lining up spring and fall apparel runs — if you have events, reunions, or team orders coming, reply and we'll get options on paper (no pressure).\n\n` +
        `— Cheeky`;
      break;
    default:
      text = `Hi ${name},\n\nTouching base from Cheeky — reply when you can.\n\n— Cheeky`;
  }

  return { subject, textBody: text };
}

/**
 * @param {object} item
 */
async function generateSalesMessage(item) {
  if (!item || typeof item !== "object") {
    return { ok: false, error: "item required", draftOnly: true };
  }

  const { subject, textBody } = buildBodies(item);
  const toAddress = String(item.email || "").trim() || "pending-review@cheeky.local";
  const idemRaw =
    typeof item.idempotencyKey === "string" && item.idempotencyKey.trim()
      ? item.idempotencyKey.trim()
      : `sales-msg-${String(item.type || "x")}-${String(item.orderId || "")}-${crypto.randomBytes(6).toString("hex")}`;
  const idem = idemRaw.slice(0, 120);

  const prisma = getPrisma();
  if (prisma && prisma.communicationApproval) {
    try {
      const existing = await prisma.communicationApproval.findFirst({ where: { idempotencyKey: idem } });
      if (existing) {
        return {
          ok: true,
          stored: "CommunicationApproval",
          id: existing.id,
          existing: true,
          draftOnly: true,
          subject,
          textBody,
        };
      }
      const row = await prisma.communicationApproval.create({
        data: {
          orderId: item.orderId || null,
          channel: "email",
          toAddress,
          subject,
          textBody,
          htmlBody: null,
          idempotencyKey: idem,
          status: "DRAFT",
          messageType: item.messageType || "SALES_FOLLOWUP",
          salesOpportunityId: item.salesOpportunityId || null,
        },
      });
      return {
        ok: true,
        stored: "CommunicationApproval",
        id: row.id,
        draftOnly: true,
        subject,
        textBody,
      };
    } catch (e) {
      const fb = appendFallbackLine({
        at: new Date().toISOString(),
        stored: "json_fallback",
        reason: e.message || String(e),
        item,
        subject,
        textBody,
        idempotencyKey: idem,
      });
      return {
        ok: true,
        stored: "json_fallback",
        fallback: fb,
        draftOnly: true,
        subject,
        textBody,
      };
    }
  }

  const fb = appendFallbackLine({
    at: new Date().toISOString(),
    stored: "json_fallback",
    reason: "prisma_unavailable",
    item,
    subject,
    textBody,
    idempotencyKey: idem,
  });
  return {
    ok: !!fb.ok,
    stored: "json_fallback",
    fallback: fb,
    draftOnly: true,
    subject,
    textBody,
  };
}

module.exports = {
  generateSalesMessage,
  buildBodies,
};
