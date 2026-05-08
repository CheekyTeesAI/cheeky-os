"use strict";

/**
 * Cockpit blocker-first payloads — aggregates production board, Square reads, approvals.
 */

const approvalEngine = require("../workflow/approvalEngine");
const productionBoardService = require("../production/productionBoardService");
const squareLiveReadService = require("../connectors/squareLiveReadService");
const frictionLogService = require("../ops/frictionLogService");
const snapshotCache = require("../cache/squareSnapshotCache");

const SOURCE_LIVE_DB = "live_db_orders";
const SOURCE_SQUARE_SNAPSHOT = "square_snapshot_readonly";
const SOURCE_APPROVALS = "approval_queue_local";
const SOURCE_FRICTION = "operator_friction";
const SOURCE_HEALTH = "system_health_placeholder";
/** Phase 5 — self-service intake rows (approval gate created separately during submission). */
const SOURCE_INTAKE_SELF = "customer_intake_self_service";

/** @returns {Promise<object>} */
async function buildBlockerFirstEnvelope() {
  const generatedAt = new Date().toISOString();

  const squareEnvelope = await squareLiveReadService.refreshSquareOperationalSnapshot();
  const prod = await productionBoardService.buildOperationalProductionBoard();

  /** @returns {object} */
  function blockerCardBase(partial) {
    return {
      customer: "",
      orderName: "",
      blockerType: "operational_hold",
      blockerReason: "",
      moneyImpact: "unknown",
      productionImpact: "unknown",
      whatToDoNext: "",
      approvalRequired: false,
      dueDate: null,
      source: SOURCE_LIVE_DB,
      lastUpdated: generatedAt,
      ...partial,
    };
  }

  /** @type {object[]} */
  const criticalBlockers = [];

  Object.keys(prod.columns || {}).forEach((colKey) => {
    const lane = prod.columns[colKey];
    if (!Array.isArray(lane)) return;
    lane.forEach((card) => {
      if (
        colKey === "On Hold" ||
        colKey === "Waiting on Deposit" ||
        (colKey === "Art Needed" && card.blockerReason) ||
        colKey === "Evaluate & Approve"
      ) {
        let moneyImpact = "low_or_none";
        if (colKey === "Waiting on Deposit") moneyImpact = "cashflow_blocked";
        if (colKey === "On Hold") moneyImpact = "cashflow_uncertain";

        let productionImpact = "schedule_slip_possible";
        if (colKey === "Waiting on Deposit" || colKey === "Art Needed") productionImpact = "floor_stopped_until_cleared";

        criticalBlockers.push(
          blockerCardBase({
            id: `prod-${card.id}-${colKey}`.slice(0, 120),
            customer: card.customer,
            orderName: card.orderName,
            blockerType: colKey.toLowerCase().replace(/\s+/g, "_"),
            blockerReason:
              card.blockerReason ||
              `${colKey}: ${card.customer || ""} paused until ${actingFocus(colKey)} steps finish.`,
            moneyImpact,
            productionImpact,
            whatToDoNext: card.nextAction,
            approvalRequired: !!card.approvalRequired,
            dueDate: card.dueDate,
            source: SOURCE_LIVE_DB,
          })
        );
      }
    });
  });

  const cashRiskCards = buildCashRiskBlockers(squareEnvelope, generatedAt);

  /** Phase 5 self-service intake (after cash visibility, before approvals fan-out fatigue) */
  /** @type {object[]} */
  let intakeSelfServiceCards = [];
  try {
    const selfServiceIntakeService = require("../intake/selfServiceIntakeService");
    intakeSelfServiceCards = selfServiceIntakeService.listPendingIntake(30).map((it) =>
      blockerCardBase({
        id: `intake-ss-${it.id}`,
        customer: String(it.name || "").slice(0, 120),
        orderName: `Self-service intake ${String(it.id || "").slice(0, 32)}`,
        blockerType: "customer_intake_review",
        blockerReason: `${
          it.garmentType ? String(it.garmentType).slice(0, 80) + " • " : ""
        }Qty est ${String(it.quantityEstimate || "TBD").slice(0, 42)} • due hint ${
          it.dueDateCustomer ? String(it.dueDateCustomer).slice(0, 36) : "unknown"
        }`,
        moneyImpact: "pipeline_only_until_quoted",
        productionImpact: "none_until_staff_converts_quote",
        whatToDoNext:
          "Internal quote + draft replies only — outbound email still passes Patrick approvals / normal inbox tooling.",
        approvalRequired: false,
        dueDate: it.dueDateCustomer || null,
        source: SOURCE_INTAKE_SELF,
      })
    );
  } catch (_intErr) {}

  /** production-only blockers (Jeremy-visible) excluding cash duplication */
  const productionBlockers = criticalBlockers.filter((b) => b.blockerType !== "unpaid_invoice" && !b.id.startsWith("cash-"));

  const approvalsCards = approvalEngine.getPendingApprovals().slice(0, 120).map((a) =>
    blockerCardBase({
      id: String(a.approvalId || a.taskId),
      customer: "",
      orderName: `approval · ${String(a.category || "task").slice(0, 54)}`,
      blockerType: "approval_needed",
      blockerReason:
        String(a.reason || "").slice(0, 400) || "Patrick must approve before automation or messaging proceeds.",
      moneyImpact: "depends_on_payload",
      productionImpact: "team_idle_until_signed",
      whatToDoNext: "Patrick reviews queue in approvals console — no auto-send from Cheeky OS.",
      approvalRequired: true,
      dueDate: a.requestedAt || null,
      source: SOURCE_APPROVALS,
    })
  );

  const readyJeremyLane = prod.columns["Production Ready"] || [];
  const readyForJeremy = readyJeremyLane.map((c) =>
    blockerCardBase({
      id: `jeremy-ready-${c.id}`,
      customer: c.customer,
      orderName: c.orderName,
      blockerType: "ready_for_floor",
      blockerReason: "Nothing blocking Jeremy — blanks + approvals satisfied for this lane.",
      moneyImpact: "positive_when_job_finishes",
      productionImpact: "should_print_now",
      whatToDoNext: c.nextAction,
      approvalRequired: false,
      dueDate: c.dueDate,
      source: SOURCE_LIVE_DB,
    })
  );

  const frictionPulse = frictionLogService.tailRecent(5).filter((x) => x.area !== frictionLogService.PLAYBOOK_AREA);

  const sections = [
    labelSection(
      "CRITICAL BLOCKERS",
      criticalBlockers.length
        ? criticalBlockers.slice(0, 40)
        : [
            blockerCardBase({
              id: "noop-critical",
              orderName: "No critical blockers detected",
              customer: "",
              blockerType: "none",
              blockerReason: prod.emptyExplanation || "Queues look clear in this snapshot — keep watching deposits + art proofs.",
              moneyImpact: "none",
              productionImpact: "none",
              whatToDoNext: "Refresh often; log friction via POST /api/ops/friction-log if UX gaps appear.",
              source: SOURCE_HEALTH,
            }),
          ],
      "Highest impact issues blocking cash or presses."
    ),
    labelSection("CASH RISKS", cashRiskCards, squareEnvelope.message || ""),
    labelSection(
      "PRODUCTION BLOCKERS",
      productionBlockers.slice(0, 40).length
        ? productionBlockers.slice(0, 40)
        : [
            blockerCardBase({
              id: "noop-prodblk",
              orderName: "No production blocker rows surfaced",
              customer: "",
              blockerType: "none",
              blockerReason: prod.emptyExplanation || "If this feels wrong verify Prisma connectivity.",
              moneyImpact: "none",
              productionImpact: "none",
              whatToDoNext: "Coach Jeremy using Ready for Jeremy lane when PRODUCTION_READY items appear.",
              source: SOURCE_LIVE_DB,
            }),
          ],
      "Anything choking blanks, art, approvals, or holds."
    ),
    labelSection(
      "SELF-SERVICE INTAKE QUEUE",
      intakeSelfServiceCards.length
        ? intakeSelfServiceCards
        : [
            blockerCardBase({
              id: "noop-intake-self",
              orderName: "No queue entries",
              customer: "",
              blockerType: "none",
              blockerReason: "Web intake inbox is calm — submissions land automatically when customers submit the public form.",
              moneyImpact: "none",
              productionImpact: "none",
              whatToDoNext:
                "/cheeky-os-ui/customer-intake.html is the customer-safe entry — still no auto-quote or outbound auto-send.",
              approvalRequired: false,
              source: SOURCE_INTAKE_SELF,
            }),
          ],
      "Customer-submitted drafts only · convert via normal intake playbook."
    ),
    labelSection(
      "APPROVALS NEEDED",
      approvalsCards.length
        ? approvalsCards
        : [
            blockerCardBase({
              id: "noop-apr",
              orderName: "No pending approvals",
              customer: "",
              blockerType: "none",
              blockerReason: "Nothing waiting in local approvals.jsonl snapshot.",
              moneyImpact: "none",
              productionImpact: "none",
              whatToDoNext: "Still follow visibility → draft → approve before any external send.",
              source: SOURCE_APPROVALS,
            }),
          ],
      "Patrick checkpoints only."
    ),
    labelSection(
      "READY FOR JEREMY",
      readyForJeremy.slice(0, 40).length
        ? readyForJeremy.slice(0, 40)
        : [
            blockerCardBase({
              id: "noop-jeremy",
              orderName: "Nothing flagged PRODUCTION_READY",
              customer: "",
              blockerType: "prep_queue_empty",
              blockerReason: "Deposit + art + garments must clear before Jeremy sees live jobs here.",
              moneyImpact: "none",
              productionImpact: "none",
              whatToDoNext: "Clear deposit + art approvals + garment receipts first.",
              source: SOURCE_LIVE_DB,
            }),
          ],
      "Plain-English cues for presses."
    ),
    labelSection(
      "SYSTEM HEALTH",
      [
        blockerCardBase({
          id: "health-square",
          orderName: "Square snapshot connector",
          customer: "",
          blockerType: "connector_status",
          blockerReason:
            squareEnvelope.status === "fresh"
              ? "Square read refreshed successfully."
              : squareEnvelope.message || "Showing cached envelope only.",
          moneyImpact: "visibility_risk_when_offline",
          productionImpact: "none",
          whatToDoNext: "Reconnect tokens if caches look stale.",
          approvalRequired: false,
          dueDate: null,
          source: SOURCE_SQUARE_SNAPSHOT,
          lastUpdated: squareEnvelope.cachedAt || generatedAt,
        }),
        blockerCardBase({
          id: "health-friction",
          orderName: "Recent friction signal",
          customer: "",
          blockerType: "operator_signals",
          blockerReason:
            frictionPulse.length === 0
              ? "No fresh operator friction logged."
              : `${frictionPulse.length} friction lines this week.`,
          moneyImpact: "none",
          productionImpact: frictionPulse.length ? "process_drag" : "none",
          whatToDoNext: "Log friction quickly when UI blocks you — builds the weekly playbook.",
          approvalRequired: false,
          source: SOURCE_FRICTION,
        }),
      ],
      "Safe signals only — no stack traces."
    ),
  ];

  return {
    success: true,
    generatedAt,
    squareStatus: squareEnvelope.status,
    squareMessage: squareEnvelope.message,
    squareCachedAt: squareEnvelope.cachedAt,
    productionMeta: {
      emptyExplanation: prod.emptyExplanation,
      orderCount: prod.orderCount,
    },
    sections,
  };
}

function labelSection(title, cards, note) {
  return { title, note: note || null, cards };
}

function actingFocus(colKey) {
  if (colKey === "Waiting on Deposit") return "customer payment";
  if (colKey === "Art Needed") return "art / proof";
  return "operator";
}

function buildCashRiskBlockers(squareEnvelope, generatedAt) {
  const data = squareEnvelope.data && typeof squareEnvelope.data === "object" ? squareEnvelope.data : {};
  const unpaid = Array.isArray(data.unpaidInvoices) ? data.unpaidInvoices : [];
  const stale = Array.isArray(data.estimateFollowups) ? data.estimateFollowups : [];
  const src = squareEnvelope.status === "fresh" ? SOURCE_SQUARE_SNAPSHOT : SOURCE_SQUARE_SNAPSHOT;

  /** @type {object[]} */
  const out = [];
  unpaid.slice(0, 25).forEach((inv, i) => {
    out.push({
      id: `cash-unpaid-${inv.invoiceId || inv.id || i}`,
      customer: String(inv.title || inv.customerNameHint || "Square customer").slice(0, 120),
      orderName: "Square invoice",
      blockerType: "unpaid_invoice",
      blockerReason: "Customer still owes balance on a published Square invoice.",
      moneyImpact: "cash_at_risk",
      productionImpact: "do_not_ship_until_policy_says_otherwise",
      whatToDoNext: "Follow internal collections script — never auto-charge from Cheeky OS.",
      approvalRequired: false,
      dueDate: null,
      source: src,
      lastUpdated: generatedAt,
    });
  });
  stale.slice(0, 15).forEach((s, i) => {
    out.push({
      id: `cash-est-${s.id || i}`,
      customer: String(s.title || "Open Square order").slice(0, 120),
      orderName: "Stale estimate / open order",
      blockerType: "estimate_followup",
      blockerReason: "Open Square order getting old — customer may ghost.",
      moneyImpact: "opportunity_loss",
      productionImpact: "none_yet",
      whatToDoNext: "Manual follow-up or internal draft comms (approval still required).",
      approvalRequired: true,
      dueDate: null,
      source: src,
      lastUpdated: generatedAt,
    });
  });

  if (!out.length) {
    out.push({
      id: "cash-placeholder",
      customer: "",
      orderName: "No unpaid rows in snapshot",
      blockerType: "cash_clear_or_offline",
      blockerReason:
        squareEnvelope.status === "cached" && (!unpaid.length && snapshotCache.readSnapshotDisk().data?.unpaidInvoices?.length)
          ? snapshotCache.readSnapshotDisk().cachedAt || "Historical cache only"
          : "Either Square is quiet or connectors need configuration.",
      moneyImpact: "unknown",
      productionImpact: "none",
      whatToDoNext:
        squareEnvelope.message ||
        "If this feels wrong, verify Square sandbox/production tokens and rerun dashboard refresh.",
      approvalRequired: false,
      dueDate: null,
      source: src,
      lastUpdated: generatedAt,
    });
  }

  return out.slice(0, 40);
}

module.exports = {
  buildBlockerFirstEnvelope,
};
