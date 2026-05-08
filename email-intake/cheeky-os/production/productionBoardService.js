"use strict";

/**
 * Jeremy / Patrick friendly production board — plain English, blocker-first fields.
 * READ-ONLY — never mutates orders.
 */

const path = require("path");
const { computeStuckReasons } = require("../services/operatorStuckReasons");
const wf = require("../workflow/orderWorkflowRules");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function depositLabel(o) {
  if (!o) return "unknown";
  if (wf.depositPaid(o)) return "deposit_received";
  if (o.squareInvoiceId || o.squareInvoicePublished) return "deposit_expected";
  return "no_invoice_yet";
}

function artPlain(o) {
  if (!o) return "unknown";
  if (wf.artIsApproved(o)) return "approved";
  if (o.digitizingRequired && String(o.digitizingStatus || "").toUpperCase().match(/PEND|WAIT|ACTIVE/))
    return "digitizing";
  const ac = String(o.artApprovalStatus || "NOT_REQUESTED").toUpperCase();
  if (/REQUESTED|CHANGE/.test(ac)) return "waiting_on_customer_proof";
  if (/MISSING|NEEDED|TBD/i.test(String(o.artFileStatus || ""))) return "needs_files";
  return "needs_review";
}

function garmentPlain(o) {
  if (!o) return "unknown";
  if (o.garmentsReceived) return "blanks_here";
  if (o.garmentsOrdered) return "waiting_vendor";
  if (!wf.depositPaid(o)) return "deposit_first";
  if (o.garmentOrderNeeded === false) return "not_needed";
  return "need_to_order_blanks";
}

function actingPartyFor(column, o) {
  if (column === "On Hold" || column === "Evaluate & Approve") return "Patrick";
  if (column === "Garments Ordered") return "Vendor";
  if (column === "Garments Needed") return wf.depositPaid(o) ? "Patrick" : "Customer";
  if (/Digitizing|Art Needed/i.test(column)) return "Vendor";
  if (column === "Waiting on Deposit") return "Customer";
  if (/Production Ready|In Production|QC|Ready for Pickup/.test(column)) return "Jeremy";
  return "Patrick";
}

/**
 * Resolve single column assignment (first match wins, top → bottom urgency).
 */
function assignColumn(o) {
  const st = String(o.status || "INTAKE").toUpperCase();
  if (o.completedAt || st === "COMPLETED") return "Completed";

  /** Hold / escalation */
  if (o.blockedReason && String(o.blockedReason).trim()) return "On Hold";

  if (st === "READY" || (o.readyForPickup && !o.completedAt)) return "Ready for Pickup";

  /** Floor stages */
  if (st === "QC") return "QC";
  if (st === "PRINTING") return "In Production";
  if (st === "PRODUCTION_READY") return "Production Ready";

  /** Vendor garments */
  if (o.garmentsOrdered && !o.garmentsReceived) return "Garments Ordered";
  if (wf.depositPaid(o) && o.garmentOrderNeeded !== false && !o.garmentsOrdered) return "Garments Needed";

  /** Approvals gate */
  if (wf.depositPaid(o) && wf.artIsApproved(o) && !o.isApproved) return "Evaluate & Approve";

  /** Art path */
  if (o.digitizingRequired && !String(o.digitizingStatus || "").toUpperCase().match(/COMPLETE|DONE/))
    return "Digitizing";

  const artNeeds = artPlain(o);
  if (artNeeds.match(/needs_files|waiting_on_customer_proof|digitizing|needs_review/) && artNeeds !== "approved")
    return "Art Needed";

  /** Invoice / intake */
  if (!wf.depositPaid(o) && (o.squareInvoiceId || o.squareInvoicePublished || st.match(/INV|QUOTE|OPEN/)))
    return "Waiting on Deposit";

  /** Approved pre-production backlog */
  if (o.isApproved && wf.artIsApproved(o) && wf.depositPaid(o) && wf.workOrderCreated(o)) {
    /** If not yet categorized into garment/prod buckets */
    if (!["PRODUCTION_READY", "PRINTING", "QC"].includes(st)) return "Approved for Production";
  }

  if (
    wf.depositPaid(o) &&
    !o.isApproved &&
    wf.artIsApproved(o) &&
    !(o.blockedReason && String(o.blockedReason).trim())
  )
    return "Evaluate & Approve";

  /** Default funnel */
  if (st.match(/QUOTE|EST|INTAKE|TENDER/) || (!o.squareInvoiceId && !wf.depositPaid(o))) return "Intake";

  return "Intake";
}

/** @returns {object} */
function rowToJeremyCard(o, column, stuckPreview) {
  const dep = depositLabel(o);
  const garments = garmentPlain(o);
  const art = artPlain(o);
  const orderName =
    String(o.orderNumber || "").trim() ||
    String(o.customerName || "").trim().slice(0, 54) ||
    String(o.id).slice(0, 14);

  let blockerReason =
    stuckPreview ||
    (o.blockedReason && String(o.blockedReason).trim()) ||
    (column === "Waiting on Deposit" ? "Deposit not recorded — production stays paused." : null);

  let nextAction = "Nothing urgent on this ticket right now.";
  if (column === "Waiting on Deposit") {
    nextAction = "Call or email customer to settle deposit once invoice is accurate.";
    if (!blockerReason) blockerReason = "Cash has not landed for this invoice yet.";
  } else if (column === "Art Needed") {
    nextAction =
      art === "waiting_on_customer_proof"
        ? "Wait for customer artwork approval via proof."
        : "Collect vector art or dispatch to digitizing partner.";
    if (!blockerReason) blockerReason = "Production cannot queue until artwork is approved.";
  } else if (column === "Garments Needed") {
    nextAction = "Prepare Carolina Made garment draft internally — approvals before send.";
    if (!blockerReason) blockerReason = "Blank inventory not committed.";
  } else if (column === "Garments Ordered") {
    nextAction = "Track blanks shipment — update team when blanks arrive.";
    if (!blockerReason) blockerReason = "Jeremy waits on blanks before hitting the presses.";
  } else if (column === "Evaluate & Approve") {
    nextAction = "Patrick signs off digitally before garments or production escalate.";
    if (!blockerReason) blockerReason = "Operational approval gate before spend.";
  } else if (column === "Approved for Production") {
    nextAction = "Patrick moves ticket when garments landed or digitally ready.";
  } else if (column === "Production Ready") {
    nextAction = "Jeremy queues this job for the next DTG / screen-print run.";
    if (!blockerReason) blockerReason = "";
  } else if (column === "In Production" || column === "QC") {
    nextAction = "Jeremy runs print + QC checkpoints.";
  } else if (column === "Ready for Pickup") {
    nextAction = "Notify customer politely that order is boxed — pickup + final settle.";
  } else if (column === "Completed") {
    nextAction = "Archive thank-you touches if needed.";
  } else if (column === "On Hold") {
    nextAction = "Patrick resolves hold reason — update customer-facing notes.";
    if (!blockerReason) blockerReason = "Job paused until owner clears exception.";
  } else if (column === "Intake") {
    nextAction = "Quote + Square estimate / invoice if client is ready.";
  }

  /** Fix typo leftover */
  nextAction = String(nextAction).replace(/^$/, "");

  const approvalNeeded =
    column === "Evaluate & Approve" ||
    /REQUESTED|CHANGES_REQUESTED/i.test(String(o.artApprovalStatus || "")) ||
    !!o.blockedReason;

  const pm = String(o.printMethod || o.productionTypeFinal || "tbd").toUpperCase();

  return {
    id: String(o.id),
    customer: String(o.customerName || ""),
    orderName,
    dueDate: o.quoteExpiresAt ? String(o.quoteExpiresAt) : null,
    productionMethod: pm === "TBD" ? "not_set_yet" : pm,
    artStatus: art,
    depositStatus: dep,
    garmentStatus: garments,
    blockerReason: blockerReason ? String(blockerReason).slice(0, 400) : null,
    nextAction: nextAction.slice(0, 400),
    actingParty: actingPartyFor(column, o),
    approvalRequired: !!(approvalNeeded && column !== "Completed"),
    columnStage: column,
  };
}

/**
 * @returns {Promise<{ columns: Record<string, object[]>, emptyExplanation?: string|null, generatedAt: string }>}
 */
async function buildOperationalProductionBoard() {
  const prisma = getPrisma();
  /** @type {Record<string, object[]>} */
  const cols = {
    Intake: [],
    "Waiting on Deposit": [],
    "Art Needed": [],
    Digitizing: [],
    "Evaluate & Approve": [],
    "On Hold": [],
    "Approved for Production": [],
    "Garments Needed": [],
    "Garments Ordered": [],
    "Production Ready": [],
    "In Production": [],
    QC: [],
    "Ready for Pickup": [],
    Completed: [],
  };

  if (!prisma || !prisma.order) {
    return {
      columns: cols,
      emptyExplanation:
        "Database connector not available — reopen after DATABASE_URL fixes. Showing empty columns with placeholders only.",
      generatedAt: new Date().toISOString(),
    };
  }

  /** @type {unknown[]} */
  let rows = [];
  try {
    rows = await prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 400,
    });
  } catch (_e) {
    rows = [];
    return {
      columns: cols,
      emptyExplanation:
        "Live query failed safely — reconcile Prisma columns vs database. Showing empty buckets until repaired.",
      generatedAt: new Date().toISOString(),
    };
  }

  rows.forEach((o) => {
    const stuck = computeStuckReasons(o);
    const stuckPreview = stuck && stuck.length ? String(stuck[0]).slice(0, 200) : null;
    const col = assignColumn(o);
    const card = rowToJeremyCard(o, col, stuckPreview);
    if (!cols[col]) cols["Intake"].push(card);
    else cols[col].push(card);
  });

  const total = rows.length;
  return {
    columns: cols,
    emptyExplanation: total === 0 ? "No orders in database snapshot — connectors still safe." : null,
    generatedAt: new Date().toISOString(),
    orderCount: total,
  };
}

module.exports = {
  buildOperationalProductionBoard,
  assignColumn,
};
