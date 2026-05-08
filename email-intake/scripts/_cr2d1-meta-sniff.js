"use strict";
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: true });
const dv = require("../cheeky-os/data/dataverse-store");

const LOGICALS = [
  "cr2d1_audit_event",
  "cr2d1_auditevent",
  "cr2d1_intakequeue",
  "cr2d1_intake_queue",
];

(async () => {
  for (const logical of LOGICALS) {
    const q = `EntityDefinitions(LogicalName='${logical}')?$select=LogicalName,PrimaryIdAttribute,EntitySetName`;
    const r = await dv.odataRequest("GET", q, null, null, { timeoutMs: 30000 });
    console.log(
      logical + ":",
      r.ok && r.data
        ? JSON.stringify({
            LogicalName: r.data.LogicalName,
            PK: r.data.PrimaryIdAttribute,
            Set: r.data.EntitySetName,
          })
        : String(r.error).slice(0, 140)
    );
  }
})();
