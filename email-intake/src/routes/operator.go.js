"use strict";

/**
 * Operator mode one-command orchestrator route.
 */

const { Router } = require("express");
const { internalHttpCall } = require("../utils/internalHttpCall");

const router = Router();

function fail(errorMessage) {
  return {
    ok: false,
    success: false,
    stage: "operator_go",
    data: null,
    error: String(errorMessage)
  };
}

function successPayload(data) {
  return {
    ok: true,
    success: true,
    stage: "operator_go",
    data,
    error: null
  };
}

function firstFailureAlert(alerts) {
  if (!Array.isArray(alerts)) return "";
  for (const a of alerts) {
    if (String(a || "").toLowerCase().includes("fail")) return String(a);
  }
  return "";
}

router.post("/go", async (req, res) => {
  const text = String((req.body && req.body.text) || "").trim();

  try {
    let leadIntake = { added: 0, skipped: 0 };
    if (text) {
      const intake = await internalHttpCall("/customers/quick-add", {
        method: "POST",
        body: { text }
      });
      if (!intake || intake.success === false || intake.ok === false) {
        return res.status(200).json(
          fail(
            (intake && intake.error) || "quick-add failed"
          )
        );
      }
      const parsedCount =
        Number(intake.data && intake.data.parsedCount) ||
        Number(intake.data && intake.data.added) ||
        0;
      leadIntake = { added: parsedCount, skipped: 0 };
    }

    const revenueCommand = await internalHttpCall("/revenue/command", {
      method: "POST",
      body: {}
    });
    if (!revenueCommand || revenueCommand.success === false || revenueCommand.ok === false) {
      return res.status(200).json(
        fail((revenueCommand && revenueCommand.error) || "revenue command failed")
      );
    }

    const dashboard = await internalHttpCall("/founder/dashboard", {
      method: "GET"
    });
    if (!dashboard || dashboard.success === false || dashboard.ok === false) {
      return res.status(200).json(
        fail((dashboard && dashboard.error) || "founder dashboard missing")
      );
    }

    const ops = await internalHttpCall("/ops/status", { method: "GET" });
    if (!ops || ops.success === false) {
      return res.status(200).json(fail((ops && ops.error) || "ops status failed"));
    }

    const sendPayload =
      revenueCommand.data &&
      revenueCommand.data.pipeline &&
      revenueCommand.data.pipeline.send;
    const autoSent =
      sendPayload &&
      sendPayload.data &&
      typeof sendPayload.data.sent === "number"
        ? sendPayload.data.sent
        : 0;

    const runSummary = {
      processed:
        Number(
          revenueCommand.data &&
            revenueCommand.data.outreach &&
            revenueCommand.data.outreach.processed
        ) || 0,
      hotLeads:
        Number(
          revenueCommand.data &&
            revenueCommand.data.outreach &&
            revenueCommand.data.outreach.hotLeads
        ) || 0,
      messagesGenerated:
        Number(
          revenueCommand.data &&
            revenueCommand.data.outreach &&
            revenueCommand.data.outreach.messagesGenerated
        ) || 0,
      readyToSend:
        Number(
          revenueCommand.data &&
            revenueCommand.data.queue &&
            revenueCommand.data.queue.approved
        ) || 0,
      autoSent
    };

    const dashboardAlerts =
      (dashboard.data && Array.isArray(dashboard.data.alerts) && dashboard.data.alerts) ||
      [];
    const alerts = [...dashboardAlerts];
    if (!text && runSummary.processed === 0) {
      alerts.push("No new leads were added");
    }

    let nextAction = "Add more leads or run Square reactivation";
    if (ops.readyState === "READY_TO_SEND") {
      nextAction = "Send approved outreach now";
    } else if (firstFailureAlert(dashboardAlerts)) {
      nextAction = "Review failed sends and recover leads";
    } else if (runSummary.hotLeads > 0) {
      nextAction = "Review hot leads first";
    } else if (runSummary.processed > 0) {
      nextAction = "Review generated outreach queue";
    }

    console.log(`=== OPERATOR MODE ===
Lead add: ${leadIntake.added}
Processed: ${runSummary.processed}
Hot: ${runSummary.hotLeads}
Ready to send: ${runSummary.readyToSend}
Next: ${nextAction}
=====================`);

    return res.status(200).json(
      successPayload({
        leadIntake,
        runSummary,
        dashboard,
        ops,
        nextAction,
        alerts
      })
    );
  } catch (err) {
    return res.status(200).json(
      fail(err instanceof Error ? err.message : String(err))
    );
  }
});

module.exports = router;
