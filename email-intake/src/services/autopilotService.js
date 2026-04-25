/**
 * Controlled autopilot — deterministic recommendations, SAFE auto-actions only.
 * Uses GET /api/ai/context + dist services (no duplicated business rules).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DIST_SVC = path.join(ROOT, "dist", "services");
const LOG_FILE = path.join(ROOT, "cheeky-os", "data", "autopilot-log.json");

const STALE_DEPOSIT_DAYS = 1;
const STALE_GARMENT_DAYS = 2;

/** Never auto-execute these (safety). */
const BLOCKED_AUTO = new Set([
  "CREATE_INVOICE",
  "MARK_PICKED_UP",
  "SEND_TO_DIGITIZER",
  "MARK_ART_READY",
  "MARK_PROOF_APPROVED",
  "COMPLETE_ORDER",
  "ADVANCE_PRODUCTION",
]);

const SAFE_TYPES = new Set([
  "SEND_DEPOSIT_REMINDER",
  "SEND_PROOF_REQUEST",
  "SEND_PICKUP_NOTICE",
  "GENERATE_WORK_ORDER",
]);

function loadDist(name) {
  try {
    return require(path.join(DIST_SVC, name));
  } catch {
    return null;
  }
}

function loadMemory() {
  try {
    return require(path.join(ROOT, "src", "services", "memoryService.js"));
  } catch {
    return null;
  }
}

function port() {
  return Number(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000);
}

async function fetchAiContext() {
  const url = `http://127.0.0.1:${port()}/api/ai/context`;
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(15000)
      : undefined;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`context HTTP ${res.status}`);
  return res.json();
}

function ensureLogFile() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ entries: [] }, null, 0), "utf8");
  }
}

function appendLog(entry) {
  try {
    ensureLogFile();
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    let data = { entries: [] };
    try {
      data = JSON.parse(raw);
    } catch {
      data = { entries: [] };
    }
    if (!Array.isArray(data.entries)) data.entries = [];
    data.entries.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (data.entries.length > 2000) {
      data.entries = data.entries.slice(-2000);
    }
    fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 0), "utf8");
  } catch (err) {
    console.error("[autopilot] log:", err instanceof Error ? err.message : err);
  }
}

function memEvent(type, payload) {
  const m = loadMemory();
  if (m && typeof m.logEvent === "function") {
    try {
      m.logEvent(type, payload);
    } catch (_) {
      /* optional */
    }
  }
}

/**
 * @param {string} type
 * @returns {"SAFE" | "APPROVAL_REQUIRED"}
 */
function classifyActionRisk(type) {
  const t = String(type || "").toUpperCase();
  if (BLOCKED_AUTO.has(t)) return "APPROVAL_REQUIRED";
  if (SAFE_TYPES.has(t)) return "SAFE";
  return "APPROVAL_REQUIRED";
}

/**
 * @param {object} context from /api/ai/context
 * @returns {Array<object>}
 */
function evaluateAutopilot(context) {
  const items = [];
  const seen = new Set();

  function push(type, fields) {
    const orderId = fields.orderId ? String(fields.orderId) : "";
    const key = `${type}:${orderId || fields.customerName || Math.random()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const risk = classifyActionRisk(type);
    const autoExecutable = risk === "SAFE" && SAFE_TYPES.has(type);
    items.push({
      type,
      risk,
      reason: fields.reason || "",
      orderId: orderId || undefined,
      customerName: fields.customerName || undefined,
      autoExecutable,
    });
  }

  if (!context || context.success !== true) {
    return items;
  }

  const deps = Array.isArray(context.depositFollowups)
    ? context.depositFollowups
    : [];
  for (const d of deps) {
    const days = Number(d.daysSinceQuote) || 0;
    if (days >= STALE_DEPOSIT_DAYS) {
      push("SEND_DEPOSIT_REMINDER", {
        orderId: d.orderId,
        customerName: d.customerName,
        reason: `Order ${d.orderId || ""} awaiting deposit (${days}d since quote)`,
      });
    }
  }

  const proofs = Array.isArray(context.proofs) ? context.proofs : [];
  for (const p of proofs) {
    const st = String(p.proofStatus || "").toUpperCase();
    if (st === "NOT_SENT") {
      push("SEND_PROOF_REQUEST", {
        orderId: p.id,
        customerName: p.customerName,
        reason: `Proof not sent yet (${p.customerName || "order"})`,
      });
    }
  }

  const pickup = Array.isArray(context.readyForPickup) ? context.readyForPickup : [];
  for (const o of pickup) {
    push("SEND_PICKUP_NOTICE", {
      orderId: o.id,
      customerName: o.customerName,
      reason: `Ready for pickup — notify customer (${o.customerName || o.id})`,
    });
  }

  const garments = Array.isArray(context.garmentOrders) ? context.garmentOrders : [];
  for (const g of garments) {
    const days = Number(g.daysSinceActivity) || 0;
    if (days >= STALE_GARMENT_DAYS) {
      push("REVIEW_GARMENT_ORDER", {
        orderId: g.orderId || g.id,
        customerName: g.customerName,
        reason: `Garment order pending ${days}d — needs review`,
      });
    }
  }

  return items;
}

async function enrichPlanWithWorkOrders(baseItems) {
  const wo = loadDist("workOrderService.js");
  if (!wo || typeof wo.listWorkOrdersReady !== "function") return baseItems;
  let rows = [];
  try {
    rows = await wo.listWorkOrdersReady(80);
  } catch (err) {
    console.error("[autopilot] listWorkOrdersReady:", err instanceof Error ? err.message : err);
    return baseItems;
  }
  const seen = new Set(baseItems.map((i) => `${i.type}:${i.orderId || ""}`));
  const out = [...baseItems];
  for (const r of rows) {
    if (!r.ready) continue;
    const ws = String(r.workOrderStatus || "").toUpperCase();
    if (ws === "GENERATED" || ws === "PRINTED") continue;
    const key = `GENERATE_WORK_ORDER:${r.orderId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: "GENERATE_WORK_ORDER",
      risk: "SAFE",
      reason: "All work-order gates pass — generate packet",
      orderId: r.orderId,
      customerName: r.customerName,
      autoExecutable: true,
    });
  }
  return out;
}

async function enrichPlanWithRevisions(baseItems) {
  const rep = loadDist("customerReplyService.js");
  if (!rep || typeof rep.listRecentInboundReplies !== "function") return baseItems;
  let rows = [];
  try {
    rows = await rep.listRecentInboundReplies(40);
  } catch (err) {
    return baseItems;
  }
  const seen = new Set(baseItems.map((i) => `${i.type}:${i.orderId || ""}`));
  const out = [...baseItems];
  for (const r of rows) {
    const isRev =
      r.type === "CUSTOMER_REVISION_REQUEST" ||
      r.classification === "REVISION_REQUEST";
    if (!isRev) continue;
    const oid = r.orderId ? String(r.orderId) : "";
    const key = `REVIEW_REVISION_REQUEST:${oid || r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: "REVIEW_REVISION_REQUEST",
      risk: "APPROVAL_REQUIRED",
      reason: "Customer revision request — review before changes",
      orderId: oid || undefined,
      customerName: r.customerEmail || undefined,
      autoExecutable: false,
    });
  }
  return out;
}

async function getAutopilotPlan() {
  let context = { success: false };
  try {
    context = await fetchAiContext();
  } catch (err) {
    console.warn("[autopilot] context:", err instanceof Error ? err.message : err);
  }
  let items = evaluateAutopilot(context);
  items = await enrichPlanWithWorkOrders(items);
  items = await enrichPlanWithRevisions(items);

  for (const it of items) {
    if (BLOCKED_AUTO.has(String(it.type || "").toUpperCase())) {
      it.autoExecutable = false;
    }
  }

  memEvent("autopilot_recommendation_created", {
    count: items.length,
    contextOk: !!context.success,
  });

  return { context, items };
}

/**
 * @param {object} action
 * @param {{ dryRun?: boolean }} options
 */
async function executeAutopilotAction(action, options) {
  const dryRun = Boolean(options && options.dryRun);
  const type = String(action.type || "").toUpperCase();
  const orderId = String(action.orderId || "").trim();

  if (!orderId && type !== "REVIEW_REVISION_REQUEST") {
    return { ok: false, summary: "missing orderId" };
  }

  if (dryRun) {
    return { ok: true, summary: "dry-run" };
  }

  const comms = loadDist("customerCommsService.js");
  const wo = loadDist("workOrderService.js");

  try {
    if (type === "SEND_DEPOSIT_REMINDER") {
      if (!comms || typeof comms.sendDepositReminder !== "function") {
        throw new Error("comms unavailable");
      }
      await comms.sendDepositReminder(orderId);
      return { ok: true, summary: "sent" };
    }
    if (type === "SEND_PROOF_REQUEST") {
      if (!comms || typeof comms.sendProofRequestComm !== "function") {
        throw new Error("comms unavailable");
      }
      await comms.sendProofRequestComm(orderId);
      return { ok: true, summary: "sent" };
    }
    if (type === "SEND_PICKUP_NOTICE") {
      if (!comms || typeof comms.sendPickupReady !== "function") {
        throw new Error("comms unavailable");
      }
      await comms.sendPickupReady(orderId);
      return { ok: true, summary: "sent" };
    }
    if (type === "GENERATE_WORK_ORDER") {
      if (!wo || typeof wo.generateWorkOrder !== "function") {
        throw new Error("work order service unavailable");
      }
      const out = await wo.generateWorkOrder(orderId);
      if (!out.ok) {
        return {
          ok: false,
          summary: `blocked: ${(out.blockers || []).join("; ")}`,
        };
      }
      return { ok: true, summary: `work order ${out.workOrderNumber}` };
    }
    return { ok: false, summary: "not executable in safe mode" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, summary: msg };
  }
}

async function runAutopilotExecution(body) {
  const mode = String((body && body.mode) || "dry-run").toLowerCase();
  const plan = await getAutopilotPlan();
  const planned = plan.items;

  if (mode === "dry-run" || mode === "dry_run") {
    appendLog({
      mode: "dry-run",
      actionType: "_plan",
      orderId: null,
      risk: null,
      executed: false,
      resultSummary: `planned ${planned.length}`,
    });
    return {
      success: true,
      mode: "dry-run",
      executed: [],
      skipped: [],
      planned,
    };
  }

  if (mode !== "safe") {
    return {
      success: false,
      mode,
      error: "Only dry-run and safe modes are supported",
      executed: [],
      skipped: [],
      planned,
    };
  }

  const executed = [];
  const skipped = [];

  for (const act of planned) {
    const type = String(act.type || "").toUpperCase();
    if (classifyActionRisk(type) !== "SAFE" || !act.autoExecutable) {
      skipped.push({
        type,
        orderId: act.orderId,
        reason: "Approval required or not auto-safe",
      });
      appendLog({
        mode: "safe",
        actionType: type,
        orderId: act.orderId || null,
        risk: act.risk,
        executed: false,
        resultSummary: "skipped",
      });
      memEvent("autopilot_action_skipped", {
        type,
        orderId: act.orderId,
        reason: "not_safe_or_not_auto",
      });
      continue;
    }

    const result = await executeAutopilotAction(act, { dryRun: false });
    if (result.ok) {
      executed.push({
        type,
        orderId: act.orderId,
        result: result.summary || "ok",
      });
      appendLog({
        mode: "safe",
        actionType: type,
        orderId: act.orderId || null,
        risk: "SAFE",
        executed: true,
        resultSummary: result.summary || "ok",
      });
      memEvent("autopilot_action_executed", {
        type,
        orderId: act.orderId,
        result: result.summary,
      });
    } else {
      skipped.push({
        type,
        orderId: act.orderId,
        reason: result.summary || "failed",
      });
      appendLog({
        mode: "safe",
        actionType: type,
        orderId: act.orderId || null,
        risk: "SAFE",
        executed: false,
        resultSummary: result.summary || "failed",
      });
      memEvent("autopilot_action_skipped", {
        type,
        orderId: act.orderId,
        reason: result.summary,
      });
    }
  }

  return {
    success: true,
    mode: "safe",
    executed,
    skipped,
    planned,
  };
}

module.exports = {
  evaluateAutopilot,
  classifyActionRisk,
  executeAutopilotAction,
  getAutopilotPlan,
  runAutopilotExecution,
  fetchAiContext,
  SAFE_TYPES,
  BLOCKED_AUTO,
};
