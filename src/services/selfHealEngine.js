const FIX_LIBRARY = {
  SQUARE_ACCESS_TOKEN: {
    fix: "Add SQUARE_ACCESS_TOKEN=<your token> to .env and restart the server.",
    doc: "https://developer.squareup.com/apps",
    priority: "HIGH",
    unlocks: "live invoice data, real collections, real revenue numbers",
  },
  SQUARE_LOCATION_ID: {
    fix: "Add SQUARE_LOCATION_ID=<your location> to .env (from Square Dashboard → Locations).",
    priority: "MEDIUM",
    unlocks: "location-scoped Square queries",
  },
  OPENAI_API_KEY: {
    fix: "Add OPENAI_API_KEY=sk-... to .env to enable AI email parsing (fallback parser still works without it).",
    priority: "MEDIUM",
    unlocks: "AI intent extraction on incoming emails",
  },
  RESEND_API_KEY: {
    fix: "Add RESEND_API_KEY=re_... to .env to enable outbound email (follow-ups, briefings).",
    priority: "MEDIUM",
    unlocks: "automated customer replies and daily briefings",
  },
  TWILIO_ACCOUNT_SID: {
    fix: "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env to enable SMS.",
    priority: "LOW",
    unlocks: "outbound SMS for collections and follow-ups",
  },
  TWILIO_AUTH_TOKEN: {
    fix: "Add TWILIO_AUTH_TOKEN to .env alongside TWILIO_ACCOUNT_SID.",
    priority: "LOW",
    unlocks: "outbound SMS",
  },
  AZURE_TENANT_ID: {
    fix: "Add AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET to .env for OneDrive/Graph. Poller stays disabled (per known blocker).",
    priority: "LOW",
    unlocks: "OneDrive art/order file storage",
  },
  AZURE_CLIENT_ID: {
    fix: "Add AZURE_CLIENT_ID to .env alongside AZURE_TENANT_ID and AZURE_CLIENT_SECRET.",
    priority: "LOW",
    unlocks: "OneDrive integration",
  },
  AZURE_CLIENT_SECRET: {
    fix: "Add AZURE_CLIENT_SECRET to .env alongside AZURE_TENANT_ID and AZURE_CLIENT_ID.",
    priority: "LOW",
    unlocks: "OneDrive integration",
  },
  UPLOADS_DIR: {
    fix: "Create ./uploads/ at repo root to enable local art file storage.",
    priority: "LOW",
    unlocks: "local art asset persistence",
  },
  JOB_BLOCKERS: {
    fix: "Open GET /production/queue and resolve blocked jobs — chase customers for art / confirm print method / confirm garment + quantity.",
    priority: "MEDIUM",
    unlocks: "jobs move from blocked[] into the ready production queue",
  },
  INVOICE_VALIDATION: {
    fix: "Review incoming Square invoices — some were missing id/customer/amount and were excluded from the snapshot.",
    priority: "MEDIUM",
    unlocks: "100% invoice coverage in jobs and financials",
  },
  JOB_VALIDATION: {
    fix: "Review manually created jobs — some were missing required fields (jobId/customer/status) and were excluded.",
    priority: "MEDIUM",
    unlocks: "100% job coverage in production + financials",
  },
  SNAPSHOT_ERROR: {
    fix: "Orchestrator crashed building the snapshot. Check server logs for stack trace.",
    priority: "HIGH",
    unlocks: "the full /cheeky-ai/run payload",
  },
};

function fixFor(gap) {
  if (!gap) return null;
  const key = typeof gap === "string" ? gap : gap.key || gap.name || gap.reason;
  if (!key) return null;
  const entry = FIX_LIBRARY[String(key).toUpperCase()];
  if (entry) return entry;
  return {
    fix: `Review configuration for: ${key}. No automatic guidance available.`,
    priority: "LOW",
    unlocks: "unknown",
  };
}

function runSelfHeal(gaps) {
  try {
    const list = Array.isArray(gaps) ? gaps : [];
    const suggestions = list.map((gap) => {
      const key = typeof gap === "string" ? gap : gap.key || gap.name || gap.reason || "UNKNOWN";
      const entry = fixFor(gap) || { fix: "No fix registered.", priority: "LOW", unlocks: "unknown" };
      return {
        gap: key,
        fix: entry.fix,
        priority: entry.priority,
        unlocks: entry.unlocks,
        doc: entry.doc || null,
      };
    });
    suggestions.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    console.log("[selfHeal] suggestions:", suggestions.length, "gap(s)");
    return suggestions;
  } catch (error) {
    console.error("[selfHeal] runSelfHeal failed:", error && error.message ? error.message : error);
    return [];
  }
}

function priorityRank(p) {
  const v = String(p || "").toUpperCase();
  if (v === "HIGH") return 0;
  if (v === "MEDIUM") return 1;
  if (v === "LOW") return 2;
  return 3;
}

module.exports = {
  runSelfHeal,
  fixFor,
  FIX_LIBRARY,
};
