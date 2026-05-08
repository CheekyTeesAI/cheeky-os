"use strict";

/**
 * Writes `data/jeremy-playbook.md` from observable logs (additive living SOP helper).
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const frictionLogService = require("./frictionLogService");
const approvalGateService = require("../approvals/approvalGateService");
const insightSvc = require("../growth/googleAdsInsightService");

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_e) {
    return null;
  }
}

function playbookPath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, "jeremy-playbook.md");
}

/**
 * @param {object} [ctx]
 */
function writeJeremyPlaybook(ctx) {
  const friction = frictionLogService.tailRecent(80);
  const counts = {};
  friction.forEach((r) => {
    if (!r || r.area === frictionLogService.PLAYBOOK_AREA) return;
    const k = String(r.area || "general")
      .toLowerCase()
      .trim()
      .slice(0, 48);
    counts[k] = (counts[k] || 0) + 1;
  });
  const hotspots = Object.keys(counts)
    .map((k) => ({ area: k, n: counts[k] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  let approvalsSample = [];
  try {
    approvalsSample = approvalGateService.getApprovalHistory(40).slice(-12);
  } catch (_e) {
    approvalsSample = [];
  }

  const brief = readJsonSafe(path.join(taskQueue.DATA_DIR, "morning-brief-cache.json"));
  const wn = readJsonSafe(path.join(taskQueue.DATA_DIR, "last-what-now.json"));
  const ads = insightSvc.readInsightsSafe();

  const lines = [];
  lines.push("# Jeremy Playbook (auto-compiled, read-only)");
  lines.push("");
  lines.push(`_Generated: ${new Date().toISOString()} — human execution only; Cheeky OS never auto-sends._`);
  lines.push("");
  lines.push("## Blocker-first rhythm");
  lines.push("- Clear cash + deposit gates before burning floor time on growth experiments.");
  lines.push("- Use cockpit drafts + approvals — no silent vendor orders or customer texts.");
  lines.push("");
  lines.push("## Recurring friction hotspots");
  if (!hotspots.length) lines.push("- No friction patterns yet — keep logging when something slows money or production.");
  else
    hotspots.forEach((h) => {
      lines.push(`- **${h.area}** — ${h.n} recent notes`);
    });
  lines.push("");
  lines.push("## Recent approval rhythm (sample)");
  if (!approvalsSample.length) lines.push("- No recent approval history rows — gate may be quiet or file empty.");
  else
    approvalsSample.forEach((a) => {
      lines.push(
        `- ${a.createdAt || ""} · ${a.actionType || ""} · ${a.status || ""} · ${String(a.customer || "").slice(0, 80)}`
      );
    });
  lines.push("");
  lines.push("## Self-service intake (Phase 5)");
  lines.push("- Web box at `/cheeky-os-ui/customer-intake.html` — drafts only internally + Patrick approval gate ticket.");
  lines.push("- Convert to quote using normal playbook — NEVER auto-quote or push production from this pathway.");
  try {
    const selfServiceIntakeService = require("../intake/selfServiceIntakeService");
    const pend = selfServiceIntakeService.listPendingIntake(8);
    if (!pend.length) lines.push("- Queue quiet — no pending self-service drafts.");
    else
      pend.forEach((row) =>
        lines.push(
          `- **${String(row.name || "").slice(0, 80)}** · ${String(row.quantityEstimate || "qty TBD").slice(0, 40)} · due ${
            row.dueDateCustomer || "n/a"
          }`
        )
      );
  } catch (_is) {
    lines.push("- Queue state unknown — rerun after cheeky-os restarts cleanly.");
  }
  lines.push("");
  lines.push("## Customer communication shorthand");
  lines.push("- Every drafted customer message stays approval-gated — copy/paste manually after Patrick signs gate.");
  lines.push("- Use friendly → urgent → final reminder ladder sparingly — trust beats pressure.");
  lines.push("");
  lines.push("## Jeremy mobile cockpit tips");
  lines.push("- Turn on Jeremy Training layout to hide Patrick growth chrome — blocker sections always stay available above.");
  lines.push("- If READY FOR JEREMY is sparse, sanity-check Waiting on Deposit before promising dates on the floor.");
  lines.push("");
  lines.push("## Escalation guidance");
  lines.push("- If Square cache + Prisma diverge mentally, STOP and reconcile cash with Patrick before blaming presses.");
  lines.push("");
  lines.push("## Phase 7 — three-view cockpit & Cheeky-AI Helpbot");
  lines.push("- **Daily Advisor**: default cockpit strip synthesizes priorities + KPI/health echoes — reload after major moves.");
  lines.push("- **Jeremy**: training layout + Jeremy view hides Patrick wrap — READY lanes + drafts first.");
  lines.push("- **Patrick**: expands KPI/ads/growth `<details>` — approvals before outreach sends.");
  lines.push("- **Cheeky-AI**: `/api/cheeky-ai/ask` drafts guidance only — no sends, no status changes.");
  lines.push("- **Exports / backup**: `/api/reporting/advanced/export/:type`, `/api/backup/snapshot` on demand.");
  lines.push("");
  lines.push("## Morning brief echo");
  lines.push(brief && brief.operationalSummary ? `> ${brief.operationalSummary}` : "> No cached morning brief yet.");
  lines.push("");
  lines.push("## What-now echo");
  lines.push(wn && wn.answer ? `> ${wn.answer}` : "> No cached what-now yet.");
  lines.push("");
  lines.push("## Google Ads watch (imported heuristics only)");
  lines.push(
    ads && Array.isArray(ads.campaigns) && ads.campaigns.length
      ? `${ads.campaigns.length} campaign row(s) on disk — review Medium/High severity before bid changes.`
      : "No imported campaigns — daily review starts after JSON import."
  );
  lines.push("");
  if (ctx && ctx.nightly && ctx.nightly.tomorrowFocus) {
    lines.push("## Nightly growth focus (Patrick planning)");
    (ctx.nightly.tomorrowFocus || []).forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  const p = playbookPath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, lines.join("\n"), "utf8");
  fs.renameSync(tmp, p);
  return { ok: true, path: p };
}

/**
 * Exported for morning/what-now additive diagnostics.
 *
 * @param {number} [limit]
 * @returns {object[]}
 */
function detectFrictionHotspots(limit) {
  const n = Math.min(40, Math.max(4, Number(limit) || 12));
  const friction = frictionLogService.tailRecent(160);
  const counts = {};
  friction.forEach((r) => {
    if (!r || r.area === frictionLogService.PLAYBOOK_AREA) return;
    const k = String(r.area || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 52);
    if (!k) return;
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.keys(counts)
    .map((k) => ({ area: k, count: counts[k], severity: counts[k] >= 5 ? "high" : counts[k] >= 3 ? "medium" : "low" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * Repeated blocker fingerprints from blocker cards labels (cheap heuristic).
 *
 * @param {{ blockerReason?: string, customer?: string }[]} cards
 */
function blockerFingerprintCounts(cards) {
  /** @type {Record<string, number>} */
  const m = {};
  (cards || []).forEach((c) => {
    const raw =
      `${String(c.customer || "").toLowerCase().slice(0, 48)}|` +
      `${String(c.blockerReason || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .slice(0, 96)}`;
    if (raw.length < 6) return;
    m[raw] = (m[raw] || 0) + 1;
  });
  return Object.keys(m)
    .map((k) => ({ fingerprint: k, count: m[k] }))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

/**
 * Lightweight recurring Google Ads severity signal — no KPI fabrication.
 *
 * @param {{ severity?: string, name?: string }[]} camps
 */
function recurringAdSignals(camps) {
  const rows = (camps || []).filter((c) => ["high", "medium"].indexOf(String(c.severity || "").toLowerCase()) >= 0);
  if (!rows.length) return [];
  return [`${rows.length} imported campaign rows still carry Medium/High attention — correlate with KPI summary before edits.`];
}

module.exports = {
  writeJeremyPlaybook,
  detectFrictionHotspots,
  blockerFingerprintCounts,
  recurringAdSignals,
};
