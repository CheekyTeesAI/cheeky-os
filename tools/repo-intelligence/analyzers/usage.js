// CHEEKY RIE — Unused Service Detector
"use strict";
const fs = require("fs");

function analyzeUnusedServices(files) {
  const services = files.filter(f => f.includes("/services/") || f.includes("\\services\\"));
  const jsFiles  = files.filter(f => f.endsWith(".js"));

  const allContent = jsFiles.map(f => {
    try { return { file: f, content: fs.readFileSync(f, "utf-8") }; }
    catch { return { file: f, content: "" }; }
  });

  const results = services.filter(s => s.endsWith(".js")).map(service => {
    const name = service.split(/[\\/]/).pop().replace(".js", "");
    const usages = allContent.filter(({ file, content }) =>
      file !== service && content.includes(name)
    );
    return { service, name, usageCount: usages.length, usedIn: usages.map(u => u.file) };
  });

  const unused = results.filter(r => r.usageCount === 0);
  console.log(`[CHEEKY-GATE] Unused services: ${unused.length} of ${results.length}`);
  return results;
}

function analyzeDisconnectedSystems(files) {
  const jsFiles = files.filter(f => f.endsWith(".js"));
  let allContent = "";
  jsFiles.forEach(f => {
    try { allContent += fs.readFileSync(f, "utf-8") + "\n"; } catch {}
  });

  return {
    squareWiredToOrders:    allContent.includes("payment.updated") && allContent.includes("createOrder"),
    emailFeedingPipeline:   allContent.includes("voice/run") || allContent.includes("email-intake"),
    followUpCronActive:     allContent.includes("followups/run") && allContent.includes("cron"),
    webhookHasGuard:        allContent.includes("COMPLETED") && allContent.includes("payment.updated"),
    auditTrailPresent:      allContent.includes("auditLog") || allContent.includes("audit_log"),
    prismaServiceLayer:     allContent.includes("prisma.") && !allContent.match(/router\.(get|post|patch|put|delete)[^}]+prisma\./),
    depositFlowPresent:     allContent.includes("deposit") && allContent.includes("followup"),
    cashSnapshotActive:     allContent.includes("cashSnapshot") || allContent.includes("cash-snapshot"),
    decisionEngineWired:    allContent.includes("decisionEngine") || allContent.includes("decision-engine")
  };
}

module.exports = { analyzeUnusedServices, analyzeDisconnectedSystems };
