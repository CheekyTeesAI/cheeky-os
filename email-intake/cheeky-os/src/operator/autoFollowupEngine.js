"use strict";

const salesEngine = require("./salesEngine");
const sendEmail = require("../actions/sendEmailAction");

let lastRun = null;

module.exports = async function autoFollowupEngine() {
  try {
    const AUTO = process.env.AUTO_FOLLOWUP === "true";

    if (!AUTO) {
      console.log("[AUTO FOLLOW-UP OFF]");
      return;
    }

    const now = Date.now();

    // 10 min cooldown
    if (lastRun && now - lastRun < 10 * 60 * 1000) {
      return;
    }

    lastRun = now;

    console.log("==============================");
    console.log("[AUTO FOLLOW-UP RUNNING]");

    const data = await salesEngine();
    const actions = (data && data.actions) || [];

    let sentCount = 0;
    const MAX_SEND = 3;

    for (const a of actions) {
      try {
        if (sentCount >= MAX_SEND) break;

        // REQUIRE EMAIL
        if (!a || !a.email) {
          console.log("[SKIP] No email for action");
          continue;
        }

        // REQUIRE MESSAGE
        if (!a.suggestedMessage) {
          console.log("[SKIP] No message generated");
          continue;
        }

        const result = await sendEmail({
          to: a.email,
          subject: "Quick follow up",
          message: a.suggestedMessage,
        });

        if (result && result.success) {
          sentCount++;
          console.log("[AUTO SENT]", a.email);
        } else {
          console.log("[AUTO FAIL]", (result && (result.error || result.message)) || "send failed");
        }
      } catch (err) {
        console.log("[AUTO ITEM ERROR]", err && err.message ? err.message : String(err));
      }
    }

    console.log("[AUTO FOLLOW-UP COMPLETE]", sentCount, "sent");
    console.log("==============================");
  } catch (err) {
    console.log("[AUTO FOLLOW-UP ERROR]", err && err.message ? err.message : String(err));
  }
};
