// CHEEKY RIE — Route Analyzer
"use strict";
const fs = require("fs");

function analyzeRoutes(files) {
  const routes = [];
  const jsFiles = files.filter(f => f.endsWith(".js"));

  jsFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const matches = [
        ...content.matchAll(/(?:router|app)\.(get|post|patch|put|delete)\(['"`](.*?)['"`]/gi)
      ];
      if (matches.length) {
        routes.push({
          file,
          endpoints: matches.map(m => ({ method: m[1].toUpperCase(), path: m[2] }))
        });
      }
    } catch { /* skip unreadable */ }
  });

  const total = routes.reduce((s, r) => s + r.endpoints.length, 0);
  console.log(`[CHEEKY-GATE] Routes: ${total} endpoints in ${routes.length} files`);
  return routes;
}

module.exports = { analyzeRoutes };
