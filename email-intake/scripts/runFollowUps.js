"use strict";

const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

require("../lib/config");
const { getFollowUpCandidates, sendFollowUp } = require("../lib/followUpEngine");

(async function main() {
  try {
    const candidates = getFollowUpCandidates();
    console.log(candidates.length + " candidates found");
    let sent = 0;
    let skipped = 0;

    for (const row of candidates) {
      const r = await sendFollowUp(row.estimate, row.stage);
      if (r && r.success === true) {
        sent++;
        console.log(
          "   sent stage",
          row.stage,
          "—",
          String(row.estimate.customer || "")
        );
      } else {
        skipped++;
      }
    }

    console.log(sent + " emails sent");
    console.log(skipped + " skipped");
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("runFollowUps failed:", err.message);
    process.exitCode = 1;
  }
})();
