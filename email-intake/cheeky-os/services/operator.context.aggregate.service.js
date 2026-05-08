"use strict";

/**
 * Single operator context: snapshot + brain + cash + queues + closer + automation.
 * Every dependency is optional; failures become { available: false, error }.
 */

function safeRequire(relPath) {
  try {
    return require(relPath);
  } catch (e) {
    return null;
  }
}

function fail(err) {
  return {
    available: false,
    error: err && err.message ? String(err.message).slice(0, 240) : String(err).slice(0, 240),
  };
}

async function tryAsync(fn) {
  try {
    return await fn();
  } catch (e) {
    return fail(e);
  }
}

function trySync(fn) {
  try {
    return fn();
  } catch (e) {
    return fail(e);
  }
}

async function buildOperatorContext() {
  const snapshotMod = safeRequire("./snapshot.service");
  const snapshot =
    snapshotMod && typeof snapshotMod.buildSnapshot === "function"
      ? await tryAsync(() => snapshotMod.buildSnapshot())
      : fail(new Error("snapshot.service missing"));

  const snapPlain = snapshot && snapshot.available === false ? {} : snapshot;

  const aiMod = safeRequire("./ai.decision.service");
  const brain =
    aiMod && typeof aiMod.getDailyDirective === "function"
      ? trySync(() => aiMod.getDailyDirective(snapPlain))
      : fail(new Error("ai.decision.service missing"));

  const cashMod = safeRequire("./cash.report.service");
  const cash =
    cashMod && typeof cashMod.getCashReport === "function"
      ? await tryAsync(() => cashMod.getCashReport())
      : fail(new Error("cash.report.service missing"));

  const fuMod = safeRequire("./followup.store");
  let followups;
  if (fuMod && typeof fuMod.getDrafts === "function") {
    followups = trySync(() => ({
      summary: typeof fuMod.getSummary === "function" ? fuMod.getSummary() : {},
      drafts: fuMod.getDrafts(),
      history:
        typeof fuMod.getAllHistory === "function" ? fuMod.getAllHistory() : {},
    }));
  } else {
    followups = fail(new Error("followup.store missing"));
  }

  const inMod = safeRequire("./inbound.store");
  const inbound =
    inMod && typeof inMod.getInboundMessages === "function"
      ? trySync(() => ({
          messages: inMod.getInboundMessages(),
          count: inMod.getInboundMessages().length,
        }))
      : fail(new Error("inbound.store missing"));

  const pack = safeRequire("./closer.review.pack");
  const inStore = safeRequire("./inbound.store");
  let closer;
  if (pack && inStore && typeof pack.buildCloserReviewForMessage === "function") {
    closer = trySync(() => {
      const msgs = inStore.getInboundMessages();
      return {
        count: msgs.length,
        reviews: msgs.map((m) => pack.buildCloserReviewForMessage(m)),
      };
    });
  } else {
    closer = fail(new Error("closer.review.pack or inbound.store missing"));
  }

  const commMod = safeRequire("./communication.log");
  let communications;
  if (commMod && typeof commMod.getLogs === "function") {
    communications = trySync(() => ({
      summary: typeof commMod.getSummary === "function" ? commMod.getSummary() : {},
      recentLogs: commMod.getLogs().slice(-100),
    }));
  } else {
    communications = fail(new Error("communication.log missing"));
  }

  const autoMod = safeRequire("./automation.status.service");
  const automation =
    autoMod && typeof autoMod.getAutomationStatus === "function"
      ? trySync(() => autoMod.getAutomationStatus())
      : fail(new Error("automation.status.service missing"));

  const ordersMod = safeRequire("./orders.context.service");
  const orders =
    ordersMod && typeof ordersMod.buildOrdersContextBuckets === "function"
      ? await tryAsync(() => ordersMod.buildOrdersContextBuckets())
      : fail(new Error("orders.context.service missing"));

  const actionsMod = safeRequire("./operator.actions.queue.service");
  const actions =
    actionsMod && typeof actionsMod.buildOperatorActionQueue === "function"
      ? await tryAsync(() => actionsMod.buildOperatorActionQueue())
      : fail(new Error("operator.actions.queue.service missing"));

  return {
    snapshot,
    brain,
    cash,
    followups,
    inbound,
    closer,
    communications,
    automation,
    orders,
    actions,
  };
}

module.exports = { buildOperatorContext };
