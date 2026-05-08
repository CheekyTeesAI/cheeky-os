"use strict";

/**
 * PHASE 3 — Match inbound email to invoice / customer (best-effort, never crash).
 */

const path = require("path");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

/**
 * Parse "Name <email@domain>" or raw email.
 * @param {string} from
 * @returns {{ email: string, displayName: string }}
 */
function parseFrom(from) {
  const raw = String(from || "").trim();
  if (!raw) return { email: "", displayName: "" };

  const angle = raw.match(/<([^>]+)>/);
  if (angle) {
    const email = angle[1].trim().toLowerCase();
    const displayName = raw.replace(/<[^>]+>/, "").replace(/["']/g, "").trim();
    return { email, displayName };
  }
  if (raw.includes("@")) return { email: raw.toLowerCase(), displayName: "" };
  return { email: "", displayName: raw };
}

/**
 * Extract candidate invoice / order ids from text.
 * @param {string} text
 * @returns {string[]}
 */
function extractIds(text) {
  const t = String(text || "");
  const out = [];
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  let m;
  while ((m = uuidRe.exec(t)) !== null) out.push(m[0]);

  const invRe = /\b(?:INV|inv|invoice|#)\s*[-:]?\s*([A-Za-z0-9_-]+)/gi;
  while ((m = invRe.exec(t)) !== null) if (m[1]) out.push(m[1]);

  return [...new Set(out)];
}

/**
 * @param {object} message — { from, subject, body }
 * @returns {Promise<{matchedInvoiceId: string|null, matchedCustomerName: string|null, confidence: string, orderId: string|null}>}
 */
async function matchInbound(message) {
  const empty = {
    matchedInvoiceId: null,
    matchedCustomerName: null,
    confidence: "low",
    orderId: null,
  };

  try {
    const { email, displayName } = parseFrom(message.from);
    const corpus = `${message.subject || ""} ${message.body || ""}`;
    const ids = extractIds(corpus);

    const prisma = getPrisma();

    // 1) Match by email
    if (prisma && email) {
      try {
        const byEmail = await prisma.order.findFirst({
          where: {
            deletedAt: null,
            email: { equals: email, mode: "insensitive" },
          },
          select: { id: true, customerName: true, squareInvoiceId: true },
          orderBy: { updatedAt: "desc" },
        });
        if (byEmail) {
          return {
            matchedInvoiceId: byEmail.squareInvoiceId || byEmail.id,
            matchedCustomerName: byEmail.customerName || displayName || null,
            orderId: byEmail.id,
            confidence: "high",
          };
        }
      } catch (_) {}
    }

    // 2) Match by id in subject/body
    if (prisma && ids.length) {
      for (const cand of ids) {
        try {
          const byId = await prisma.order.findFirst({
            where: {
              deletedAt: null,
              OR: [
                { id: cand },
                { squareInvoiceId: cand },
                { orderNumber: cand },
              ],
            },
            select: { id: true, customerName: true, squareInvoiceId: true, email: true },
          });
          if (byId) {
            return {
              matchedInvoiceId: byId.squareInvoiceId || cand,
              matchedCustomerName: byId.customerName || null,
              orderId: byId.id,
              confidence: "high",
            };
          }
        } catch (_) {}
      }
    }

    // 3) Loose name match (display name from header)
    if (prisma && displayName && displayName.length > 2) {
      try {
        const byName = await prisma.order.findFirst({
          where: {
            deletedAt: null,
            customerName: { contains: displayName, mode: "insensitive" },
          },
          select: { id: true, customerName: true, squareInvoiceId: true },
          orderBy: { updatedAt: "desc" },
        });
        if (byName) {
          return {
            matchedInvoiceId: byName.squareInvoiceId || byName.id,
            matchedCustomerName: byName.customerName,
            orderId: byName.id,
            confidence: "medium",
          };
        }
      } catch (_) {}
    }

    if (displayName || email) {
      return {
        ...empty,
        matchedCustomerName: displayName || null,
        confidence: "low",
      };
    }

    return empty;
  } catch (err) {
    console.warn("[inbound.match] error:", err && err.message ? err.message : err);
    return empty;
  }
}

module.exports = { matchInbound, parseFrom, extractIds };
