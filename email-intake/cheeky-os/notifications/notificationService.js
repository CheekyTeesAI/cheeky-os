"use strict";

/**
 * In-app notifications (JSON on disk) — deduped, severity-based, read/unread without spam loops.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");
const approvalGateService = require("../approvals/approvalGateService");
const leadScoringService = require("../growth/leadScoringService");
const insightSvc = require("../growth/googleAdsInsightService");
const kpiService = require("../kpi/kpiService");

const FILE = "notifications.json";

function storePath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, FILE);
}

function readDoc() {
  const p = storePath();
  if (!fs.existsSync(p))
    return { items: [] };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" && Array.isArray(j.items) ? j : { items: [] };
  } catch (_e) {
    return { items: [] };
  }
}

function writeDoc(doc) {
  const p = storePath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function hashKey(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 20);
}

/**
 * Build fresh notification candidates and merge read states.
 */
function rebuildNotifications() {
  const doc = readDoc();
  const readMap = {};
  doc.items.forEach((x) => {
    if (x && x.id) readMap[x.id] = !!x.read;
  });

  const dayKey = new Date().toISOString().slice(0, 10);
  /** @type {object[]} */
  const next = [];

  function pushNotif(category, severity, title, detail, dedupeSrc) {
    const id = hashKey(`${dayKey}:${category}:${dedupeSrc}`);
    next.push({
      id,
      category,
      severity,
      title: String(title).slice(0, 200),
      detail: String(detail).slice(0, 1200),
      dedupeKey: dedupeSrc,
      read: !!readMap[id],
      createdAt: new Date().toISOString(),
    });
  }

  try {
    const pend = approvalGateService.getPendingApprovals();
    if (pend.length >= 4)
      pushNotif(
        "stale_approvals",
        "medium",
        "Approval queue is stacking",
        `${pend.length} tickets awaiting policy review.`,
        `approvals:${pend.length}`
      );
    pend.forEach((a) => {
      const ageHr =
        (Date.now() - new Date(a.createdAt || Date.now()).getTime()) / 3600000;
      if (ageHr > 36)
        pushNotif(
          "stale_approvals",
          "high",
          "Old approval ticket",
          `${a.actionType || "approval"} · ${String(a.customer || "").slice(0, 120)} (${Math.round(ageHr)}h)`,
          `approval:${a.id}`
        );
    });
  } catch (_eA) {}

  try {
    const leads = leadScoringService.getTopLeads(12);
    const hot = leads.filter((L) => Number(L.score) >= 82);
    if (hot.length)
      pushNotif(
        "high_value_leads",
        "low",
        "High-value scored leads surfaced",
        `${hot.length} lead(s) over 82 — drafts only.`,
        `leads-hot:${hot.length}`
      );

    const overdue = leads.filter((L) => L.flags && L.flags.overdueEstimate);
    if (overdue.length)
      pushNotif(
        "overdue_estimates",
        "medium",
        "Overdue-estimate friction flags",
        `${overdue.length} scored lead(s) need friendly follow drafts.`,
        `overdue:${overdue.length}`
      );
  } catch (_eL) {}

  try {
    const ads = insightSvc.readInsightsSafe();
    const highs = (ads.campaigns || []).filter((c) => String(c.severity || "").toLowerCase() === "high");
    if (highs.length)
      pushNotif(
        "google_ads_warning",
        "high",
        "Google Ads attention (import heuristics)",
        `${highs.length} campaign row(s) marked high — draft fixes only.`,
        `gads:${highs.length}:${dayKey}`
      );
  } catch (_eG) {}

  try {
    const ent = kpiService.readHistoryEntries();
    const last = ent.slice(-12);
    const staleQuotes = last.map((x) => x && x.snapshot && x.snapshot.staleEstimateCount).filter((n) => n != null);
    if (staleQuotes.length >= 6) {
      const tail = staleQuotes.slice(-4);
      const rising = tail[tail.length - 1] > tail[0];
      if (rising)
        pushNotif(
          "kpi_deterioration",
          "medium",
          "Stale estimate count trending up",
          "Compare with quote follow-up drafts — still approvals first.",
          `kpi-stale:${tail.join(",")}`
        );
    }
  } catch (_eK) {}

  const seen = new Set();
  const merged = [];
  next.forEach((n) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    merged.push(Object.assign({}, n, { read: !!readMap[n.id] }));
  });

  merged.sort((a, b) => String(b.severity).localeCompare(String(a.severity)));
  writeDoc({
    items: merged.slice(-120),
    updatedAt: new Date().toISOString(),
  });

  const unreadCount = merged.filter((m) => !m.read).length;
  return { items: merged, unreadCount };
}

function markRead(ids, all) {
  const doc = readDoc();
  const idSet = all ? null : new Set((ids || []).map((x) => String(x)));

  doc.items.forEach((it) => {
    if (!it) return;
    if (all || (idSet && idSet.has(String(it.id)))) it.read = true;
  });
  writeDoc(doc);
  return doc;
}

function listNotifications() {
  try {
    return rebuildNotifications();
  } catch (_e) {
    return { items: [], unreadCount: 0, degraded: true };
  }
}

module.exports = {
  listNotifications,
  markRead,
  rebuildNotifications,
};
