/**
 * Lightweight tour steps for simple frontends — no animation framework.
 */

const TOURS = {
  OWNER: [
    { section: "alerts", title: "Alerts", hint: "Only urgent items — start here when the strip is non-empty." },
    { section: "system", title: "System", hint: "Health + automation — confirms the OS is alive before deep work." },
    { section: "production", title: "Production", hint: "What is printing, blocked, or done today." },
    { section: "adoption", title: "Setup & training", hint: "First-run checklist, demo data, guides — hide when you are live-only." },
    { section: "command", title: "Command", hint: "Ask questions and run setup phrases without leaving the page." },
  ],
  PRINTER: [
    { section: "production", title: "Production", hint: "Your queue — start tasks from READY, block when something is missing." },
    { section: "command", title: "Command", hint: "Ask “What is blocked?” for a quick readout." },
  ],
  ADMIN: [
    { section: "service", title: "Service desk", hint: "Customer-facing work — clear internal waits before pinging customers." },
    { section: "approvals", title: "Approvals", hint: "Nothing goes out without passing approval rules." },
  ],
  DESIGN: [
    { section: "production", title: "Blocked", hint: "Art holds show up as blocked or service items." },
    { section: "content", title: "Content", hint: "Optional — today’s post if you also cover marketing." },
  ],
};

function getTour(role) {
  const r = String(role || "OWNER").toUpperCase();
  return { role: r, steps: TOURS[r] || TOURS.OWNER };
}

module.exports = { getTour, TOURS };
