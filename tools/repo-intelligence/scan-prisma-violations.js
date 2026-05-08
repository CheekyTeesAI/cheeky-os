"use strict";
const fs = require("fs");
const path = require("path");

const dir = path.join(process.cwd(), "src/routes");
const DONE = new Set([
  "communications.js","customers.history.js","dataSquare.js","deals.js",
  "estimates.js","finance.js","followup.actions.js","garments.js","jobs.js",
  "leads.js","orders.js","payments.js","pickup.js","print.queue.js",
  "production.actions.js","production.js","purchasing.js","quotes.js",
  "revenue.followups.js","send.approval.js","square.import.js","square.status.js",
  "square.webhook.js","squareTruth.js","tasks.js","webhooks.js","admin.js",
]);

const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") && !DONE.has(f));
const hits = [];

files.forEach(f => {
  const c = fs.readFileSync(path.join(dir, f), "utf8");
  const PATTERN = /prisma\.(order|lead|quote|task|garment|estimate|productionJob|revenueFollowup|processedWebhookEvent|customer|setting)\.(find|update|create|delete|upsert|aggregate|count|\$transaction)/;
  if (PATTERN.test(c)) {
    const lines = c.split("\n");
    const matches = lines
      .map((l, i) => ({ n: i + 1, l: l.trim() }))
      .filter(r => /prisma\./.test(r.l));
    hits.push({ file: f, count: matches.length, lines: matches.slice(0, 4).map(r => `  ${r.n}: ${r.l.slice(0, 90)}`) });
  }
});

console.log(`\n[CHEEKY-GATE] Remaining routes with direct Prisma calls: ${hits.length} of ${files.length} uninspected files\n`);
hits.forEach(h => {
  console.log(`${h.file} (${h.count} calls)`);
  h.lines.forEach(l => console.log(l));
  console.log();
});
