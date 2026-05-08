"use strict";

const emailConnector = require("../connectors/emailConnector");

function summarizeForOwner(row) {
  const st = String(row.status || "").toUpperCase();
  if (st === "NOT_CONFIGURED") {
    return row.summary || "Email connector is not configured; set Graph or Gmail env vars (see email-intake/.env.example).";
  }
  if (st === "NOT_IMPLEMENTED") {
    return (
      row.summary ||
      "Email is configured at the env level only; live mailbox read is not wired in Phase 1."
    );
  }
  if (st === "INVALID_INPUT") {
    return row.summary || "Missing contact.";
  }
  if (row.subject || row.snippet) {
    return `${row.subject || "(no subject)"} — ${row.snippet || ""}`.trim();
  }
  return row.summary || "No summary available.";
}

/**
 * Phase 1 input: `{ contact: "Jessica" }` (also accepts `contactNameOrEmail`).
 */
async function handler(params = {}) {
  const contactRaw = params.contact != null ? params.contact : params.contactNameOrEmail;
  const contact = String(contactRaw || "").trim();

  const row = await emailConnector.getLastEmailFromContact(contact);
  const st = String(row.status || "").toUpperCase();

  return {
    status: st,
    contact: row.contact !== undefined && row.contact !== null ? row.contact : contact || null,
    subject: row.subject != null ? row.subject : null,
    from: row.from != null ? row.from : null,
    receivedAt: row.receivedAt != null ? row.receivedAt : null,
    snippet: row.snippet != null ? row.snippet : null,
    summary: summarizeForOwner(row),
    missingEnvVars: row.missingEnvVars != null ? row.missingEnvVars : undefined,
  };
}

module.exports = { handler, execute: handler };
