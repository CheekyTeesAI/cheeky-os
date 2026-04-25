"use strict";
const fs = require("fs");
const schemas = [
  "email-intake/cheeky-os/prisma/schema.prisma",
  "email-intake/prisma/schema.prisma",
  "email-intake/prisma-foundation/schema.prisma",
  "email-intake/src/db/schema.prisma"
];
schemas.forEach(s => {
  try {
    const c = fs.readFileSync(s, "utf8");
    const models = [...c.matchAll(/^model\s+(\w+)/gm)].map(m => m[1]);
    const provMatch = c.match(/datasource\s+db[\s\S]*?provider\s*=\s*"([^"]+)"/);
    const prov = provMatch ? provMatch[1] : "unknown";
    console.log("\n=== " + s + " ===");
    console.log("Provider:", prov);
    console.log("Models:", models.join(", ") || "(none)");
  } catch(e) {
    console.log(s + ": ERROR - " + e.message);
  }
});
