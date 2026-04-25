"use strict";

module.exports = function startAutoFollowup() {
  try {
    if (String(process.env.AUTO_FOLLOWUP || "false").toLowerCase() !== "true") {
      console.log("[AUTO FOLLOW-UP] Disabled (AUTO_FOLLOWUP!=true)");
      return;
    }
    console.log("[AUTO FOLLOW-UP] Engine initialized");
    console.log("[AUTO FOLLOW-UP] Controlled scheduler integration active (legacy interval disabled)");
  } catch (err) {
    console.log("[AUTO FOLLOW-UP START ERROR]", err && err.message ? err.message : String(err));
  }
};
