"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Scheduler engine: node-cron
// - Safety: DAILY_SCHEDULER flag gate + full try/catch on each tick

const cron = require("node-cron");
const { runAgentLoop } = require("./agentLoop");
const { runAutopilotControlledActions } = require("./autopilotControlledActions");
const { runFollowupAutomation } = require("./followupAutomation");
const { runDecisionEngine } = require("./decisionEngine");
const { executeDecisions } = require("./decisionExecutor");
const { getDecisionMode } = require("./decisionPolicy");

let started = false;

function startAgentScheduler() {
  try {
    if (started) {
      console.log("[SCHEDULER] AGENT_LOOP | skip | already_started");
      return;
    }
    const dailyEnabled = String(process.env.DAILY_SCHEDULER || "false").toLowerCase() === "true";
    const automationEnabled =
      String(process.env.AUTOMATION_CRON_ENABLED || "false").toLowerCase() === "true";
    if (!dailyEnabled && !automationEnabled) {
      console.log("[SCHEDULER] AGENT_LOOP | disabled | DAILY_SCHEDULER!=true and AUTOMATION_CRON_ENABLED!=true");
      return;
    }

    started = true;
    console.log("[AGENT LOOP] SAFE MODE ACTIVE");
    console.log(`[AUTOPILOT] MODE = ${String(process.env.AUTOPILOT_MODE || "unknown")}`);
    if (
      String(process.env.AUTOPILOT || "false").toLowerCase() === "true" &&
      String(process.env.AUTOPILOT_MODE || "").toLowerCase() === "controlled"
    ) {
      console.log("[AUTOPILOT] CONTROLLED ACTIONS ENABLED");
      console.log("[AUTOPILOT] EXTERNAL ACTIONS DISABLED");
    }
    console.log(`[FOLLOWUP] MODE = ${String(process.env.FOLLOWUP_MODE || "draft_only")}`);
    console.log(
      `[FOLLOWUP] AUTO_SEND = ${String(process.env.FOLLOWUP_AUTO_SEND || "false").toLowerCase()}`
    );
    if (String(process.env.AUTO_FOLLOWUP || "false").toLowerCase() === "true") {
      console.log("[FOLLOWUP] SUPERVISED FOLLOW-UP ACTIVE");
      if (String(process.env.FOLLOWUP_MODE || "draft_only").toLowerCase() === "draft_only") {
        console.log("[FOLLOWUP] DRAFT-ONLY MODE ACTIVE");
      }
      if (String(process.env.FOLLOWUP_AUTO_SEND || "false").toLowerCase() === "true") {
        console.log("[FOLLOWUP] AUTO-SEND ENABLED BY OPERATOR");
      }
    }
    if (String(process.env.DECISION_ENGINE_ENABLED || "true").toLowerCase() === "true") {
      console.log(`[DECISION ENGINE] ACTIVE | mode=${getDecisionMode()}`);
    } else {
      console.log("[DECISION ENGINE] DISABLED");
    }
    Promise.resolve(runAgentLoop()).catch((err) => {
      console.error(
        "[SCHEDULER] AGENT_LOOP_STARTUP | fail |",
        err && err.message ? err.message : String(err)
      );
    });
    if (
      String(process.env.AUTOPILOT || "false").toLowerCase() === "true" &&
      String(process.env.AUTOPILOT_MODE || "").toLowerCase() === "controlled"
    ) {
      Promise.resolve(runAutopilotControlledActions())
        .then((autoResult) => {
          console.log("[SCHEDULER] AUTOPILOT_CONTROLLED_STARTUP | ok |", JSON.stringify(autoResult || {}));
        })
        .catch((autoErr) => {
          console.error(
            "[SCHEDULER] AUTOPILOT_CONTROLLED_STARTUP | fail |",
            autoErr && autoErr.message ? autoErr.message : String(autoErr)
          );
        });
    }
    if (String(process.env.AUTO_FOLLOWUP || "false").toLowerCase() === "true") {
      Promise.resolve(runFollowupAutomation())
        .then((followupResult) => {
          console.log("[SCHEDULER] FOLLOWUP_AUTOMATION_STARTUP | ok |", JSON.stringify(followupResult || {}));
        })
        .catch((followupErr) => {
          console.error(
            "[SCHEDULER] FOLLOWUP_AUTOMATION_STARTUP | fail |",
            followupErr && followupErr.message ? followupErr.message : String(followupErr)
          );
        });
    }
    if (String(process.env.DECISION_ENGINE_ENABLED || "true").toLowerCase() === "true") {
      Promise.resolve(runDecisionEngine())
        .then(async (decisionResult) => {
          try {
            if (getDecisionMode() === "controlled_internal_actions") {
              await executeDecisions((decisionResult && decisionResult.decisions) || []);
            }
          } catch (_) {}
          console.log("[SCHEDULER] DECISION_ENGINE_STARTUP | ok |", JSON.stringify({
            generated: ((decisionResult || {}).decisions || []).length,
            mode: getDecisionMode(),
          }));
        })
        .catch((decisionErr) => {
          console.error(
            "[SCHEDULER] DECISION_ENGINE_STARTUP | fail |",
            decisionErr && decisionErr.message ? decisionErr.message : String(decisionErr)
          );
        });
    }

    cron.schedule("*/15 * * * *", async () => {
      try {
        const result = await runAgentLoop();
        try {
          console.log("[SCHEDULER] AGENT_LOOP_EXECUTED | ok |", JSON.stringify((result || {}).snapshot || {}));
        } catch (_) {}

        if (
          String(process.env.AUTOPILOT || "false").toLowerCase() === "true" &&
          String(process.env.AUTOPILOT_MODE || "").toLowerCase() === "controlled"
        ) {
          try {
            const autoResult = await runAutopilotControlledActions();
            console.log("[SCHEDULER] AUTOPILOT_CONTROLLED_EXECUTED | ok |", JSON.stringify(autoResult || {}));
          } catch (autoErr) {
            console.error(
              "[SCHEDULER] AUTOPILOT_CONTROLLED_EXECUTED | fail |",
              autoErr && autoErr.message ? autoErr.message : String(autoErr)
            );
          }
        }
        if (String(process.env.AUTO_FOLLOWUP || "false").toLowerCase() === "true") {
          try {
            const followupResult = await runFollowupAutomation();
            console.log("[SCHEDULER] FOLLOWUP_AUTOMATION_EXECUTED | ok |", JSON.stringify(followupResult || {}));
          } catch (followupErr) {
            console.error(
              "[SCHEDULER] FOLLOWUP_AUTOMATION_EXECUTED | fail |",
              followupErr && followupErr.message ? followupErr.message : String(followupErr)
            );
          }
        }
        if (String(process.env.DECISION_ENGINE_ENABLED || "true").toLowerCase() === "true") {
          try {
            const decisionResult = await runDecisionEngine();
            if (getDecisionMode() === "controlled_internal_actions") {
              await executeDecisions((decisionResult && decisionResult.decisions) || []);
            }
            console.log("[SCHEDULER] DECISION_ENGINE_EXECUTED | ok |", JSON.stringify({
              generated: ((decisionResult || {}).decisions || []).length,
              mode: getDecisionMode(),
            }));
          } catch (decisionErr) {
            console.error(
              "[SCHEDULER] DECISION_ENGINE_EXECUTED | fail |",
              decisionErr && decisionErr.message ? decisionErr.message : String(decisionErr)
            );
          }
        }
      } catch (err) {
        console.error(
          "[SCHEDULER] AGENT_LOOP_TICK | fail |",
          err && err.message ? err.message : String(err)
        );
      }
    });
    console.log("[SCHEDULER] AGENT_LOOP | started | cron=*/15 * * * *");
  } catch (err) {
    console.error(
      "[SCHEDULER] AGENT_LOOP_INIT | fail |",
      err && err.message ? err.message : String(err)
    );
  }
}

module.exports = {
  startAgentScheduler,
};
