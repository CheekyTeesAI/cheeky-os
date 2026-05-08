"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { effectiveTotal, effectiveDepositRequired, depositCollected } = require("./cashRiskEngine.service");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function fallbackPath() {
  return path.join(__dirname, "..", "..", "data", "cash-followup-drafts.jsonl");
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
 * @param {"UNPAID_QUOTE"|"PARTIAL_DEPOSIT"|"OVERDUE_BALANCE"|"READY_FOR_DEPOSIT"} item.type
 * @param {string} [item.orderId]
 * @param {string} [item.quoteId]
 * @param {string} [item.customerName]
 * @param {string} [item.email]
 * @param {number} [item.balanceUsd]
 * @param {number} [item.totalUsd]
 */
function buildDraftBodies(item) {
  const name = String(item.customerName || "there").trim() || "there";
  const type = String(item.type || "UNPAID_QUOTE").toUpperCase();
  let subject = "Cheeky — quick question on your order";
  let text = "";

  switch (type) {
    case "UNPAID_QUOTE":
      subject = `Cheeky — your quote for ${name}`;
      text = `Hi ${name},\n\nFollowing up on the quote we sent — happy to tweak anything or move to deposit when you're ready. Reply here and we'll keep it moving.\n\n— Cheeky`;
      break;
    case "PARTIAL_DEPOSIT":
      subject = `Cheeky — balance / next step for ${name}`;
      text = `Hi ${name},\n\nThanks for your deposit. We still have a remaining balance before we can fully lock production — reply when you're ready to settle the rest or if you need the link again.\n\n— Cheeky`;
      break;
    case "OVERDUE_BALANCE": {
      const bal = item.balanceUsd != null ? `$${Number(item.balanceUsd).toFixed(2)}` : "your balance";
      subject = `Cheeky — ${bal} outstanding`;
      text = `Hi ${name},\n\nThis is a friendly nudge on ${bal} for your open invoice. If something's off on the amount or timing, just reply — we want to keep you whole without slowing the job.\n\n— Cheeky`;
      break;
    }
    case "READY_FOR_DEPOSIT":
      subject = `Cheeky — ready when you are (deposit)`;
      text = `Hi ${name},\n\nWe're ready to pull your job into production as soon as deposit lands — reply for the payment link or any last questions.\n\n— Cheeky`;
      break;
    default:
      text = `Hi ${name},\n\nTouching base on your Cheeky order. Reply when you can.\n\n— Cheeky`;
  }

  return { subject, textBody: text };
}

/**
 * @param {object} item
 */
async function generateCashFollowupDraft(item) {
  if (!item || typeof item !== "object") {
    return { ok: false, error: "item required" };
  }

  const { subject, textBody } = buildDraftBodies(item);
  const toAddress = String(item.email || "").trim() || "pending-review@cheeky.local";
  const idem = `cash-draft-${String(item.type || "x")}-${String(item.orderId || "")}-${String(item.quoteId || "")}-${crypto.randomBytes(6).toString("hex")}`;

  const prisma = getPrisma();
  if (prisma && prisma.communicationApproval) {
    try {
      const row = await prisma.communicationApproval.create({
        data: {
          orderId: item.orderId || null,
          channel: "email",
          toAddress,
          subject,
          textBody,
          htmlBody: null,
          idempotencyKey: idem.slice(0, 120),
          status: "PENDING",
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
  generateCashFollowupDraft,
  buildDraftBodies,
  effectiveTotal,
  effectiveDepositRequired,
  depositCollected,
};
