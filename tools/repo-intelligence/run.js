// CHEEKY RIE RUNNER v4.6 — Full Report Generator
"use strict";

const fs   = require("fs");
const path = require("path");

const { scan, ROOT }                                            = require("./scan");
const { analyzeRoutes }                                         = require("./analyzers/routes");
const { analyzeStubs }                                          = require("./analyzers/stubs");
const { analyzeUnusedServices, analyzeDisconnectedSystems }     = require("./analyzers/usage");
const { rankByCashImpact }                                      = require("./analyzers/cash");

async function runRIE() {
  console.log("[CHEEKY-GATE] RIE starting...");
  const { files, totalFiles } = scan();

  const routes        = analyzeRoutes(files);
  const stubs         = analyzeStubs(files);
  const serviceReport = analyzeUnusedServices(files);
  const disconnected  = analyzeDisconnectedSystems(files);

  // Build scoreable items
  const items = [
    ...routes.flatMap(r => r.endpoints.map(ep => ({
      type: "route", file: r.file.replace(ROOT, ""), ...ep,
      hasRoute: true, hasService: false, hasStub: false
    }))),
    ...serviceReport.map(s => ({
      type: "service", file: s.service.replace(ROOT, ""), name: s.name,
      hasRoute: false, hasService: true, usageCount: s.usageCount,
      isDisconnected: s.usageCount === 0
    })),
    ...stubs.map(s => ({
      type: "stub", file: s.file.replace(ROOT, ""),
      hasStub: true, stubCount: s.count
    }))
  ];

  const ranked = rankByCashImpact(items);

  const report = {
    scannedAt:   new Date().toISOString(),
    totalFiles,
    routeFiles:  routes.length,
    totalEndpoints: routes.reduce((s, r) => s + r.endpoints.length, 0),
    stubFiles:   stubs.length,
    serviceFiles: serviceReport.length,
    unusedServices: serviceReport.filter(s => s.usageCount === 0).length,
    routes,
    stubs,
    services:    serviceReport,
    disconnected,
    rankedItems: ranked
  };

  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  const high   = ranked.filter(i => i.cashScore >= 10);
  const medium = ranked.filter(i => i.cashScore >= 5 && i.cashScore < 10);
  const low    = ranked.filter(i => i.cashScore < 5);

  // Unique cash-critical route endpoints
  const cashRoutes = routes.flatMap(r =>
    r.endpoints
      .filter(ep => /deposit|payment|invoice|order|followup|follow-up|square|lead|quote|money|cash/i.test(ep.path + r.file))
      .map(ep => `${ep.method} ${ep.path} [${r.file.replace(ROOT, "")}]`)
  );

  const md = `# CHEEKY RIE REPORT — ${new Date().toLocaleString()}

## SUMMARY
- Total files scanned: ${totalFiles}
- JS files with Express routes: ${routes.length}
- Total endpoints mapped: ${routes.reduce((s, r) => s + r.endpoints.length, 0)}
- Service files: ${serviceReport.length}
- Unused services: ${serviceReport.filter(s => s.usageCount === 0).length}
- Files with stubs/TODOs: ${stubs.length}

## DISCONNECTED SYSTEMS
- Square wired to Orders:     ${disconnected.squareWiredToOrders  ? "YES" : "NO — FAST WIN"}
- Email feeding pipeline:     ${disconnected.emailFeedingPipeline ? "YES" : "NO — FAST WIN"}
- Follow-up cron active:      ${disconnected.followUpCronActive   ? "YES" : "NO — FAST WIN"}
- Webhook payment guard:      ${disconnected.webhookHasGuard      ? "YES" : "NO — FAST WIN"}
- Audit trail present:        ${disconnected.auditTrailPresent    ? "YES" : "NO — MISSING"}
- Deposit + Followup linked:  ${disconnected.depositFlowPresent   ? "YES" : "NO — FAST WIN"}
- Cash snapshot active:       ${disconnected.cashSnapshotActive   ? "YES" : "NO"}
- Decision engine wired:      ${disconnected.decisionEngineWired  ? "YES" : "NO"}

## CASH-CRITICAL ENDPOINTS (${cashRoutes.length})
${cashRoutes.map(e => "- " + e).join("\n")}

## HIGH VALUE — FINISH NOW (score >= 10): ${high.length} items
${high.slice(0, 30).map((i, n) => `${n + 1}. [Score: ${i.cashScore}] ${i.file}\n   Type: ${i.type}${i.name ? " | " + i.name : ""}${i.usageCount !== undefined ? " | uses: " + i.usageCount : ""}`).join("\n\n")}

## MEDIUM VALUE — SCHEDULE SOON (score 5-9): ${medium.length} items
${medium.slice(0, 20).map(i => `- [Score: ${i.cashScore}] ${i.file}`).join("\n")}

## LOW VALUE — IGNORE FOR NOW: ${low.length} items (omitted)

## STUBS DETECTED
${stubs.map(s => `- [${s.count} hits] ${s.file.replace(ROOT, "")}`).join("\n")}
`;

  fs.writeFileSync(path.join(outDir, "report.md"), md);
  console.log("[CHEEKY-GATE] RIE complete. Output: tools/repo-intelligence/output/");

  // Print key summary to console
  console.log("\n========= RIE SUMMARY =========");
  console.log("Total files:         ", totalFiles);
  console.log("Route files:         ", routes.length);
  console.log("Total endpoints:     ", routes.reduce((s, r) => s + r.endpoints.length, 0));
  console.log("Service files:       ", serviceReport.length);
  console.log("Unused services:     ", serviceReport.filter(s => s.usageCount === 0).length);
  console.log("Stub files:          ", stubs.length);
  console.log("Cash endpoints:      ", cashRoutes.length);
  console.log("\nDISCONNECTED:");
  Object.entries(disconnected).forEach(([k, v]) => console.log(" ", k.padEnd(26), v ? "OK" : "FAST WIN"));
  console.log("\nHIGH VALUE ITEMS:", high.length);
  high.slice(0, 15).forEach((i, n) => console.log(`  ${n+1}. [${i.cashScore}] ${i.type} | ${i.file} ${i.name || ""}`));

  return report;
}

runRIE().catch(err => {
  console.error("[CHEEKY-ERROR] RIE failed:", err.message);
  process.exit(1);
});
