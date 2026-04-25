/**
 * Short help blurbs keyed by section — for /help/:sectionKey and command answers.
 */

const SECTIONS = {
  "control-tower": {
    title: "Control Tower",
    description: "Single owner snapshot: health, production, service desk, approvals, money, content, and alerts.",
    bullets: [
      "Open GET / in a browser for the HTML dashboard.",
      "API clients use GET /control-tower for JSON.",
      "Alerts are limited to critical / escalation / failure signals.",
    ],
  },
  "printer-board": {
    title: "Printer board",
    description: "Production columns: ready, in production, blocked, completed — fed from the same shop board as operators.",
    bullets: ["GET /shop/board", "Use tasks to move work without editing job logic by hand."],
  },
  "admin-board": {
    title: "Admin / service",
    description: "Service desk + communications — team actions that touch customers or money stay approval-gated.",
    bullets: ["GET /service-desk", "Prefer previews before sends."],
  },
  "service-desk": {
    title: "Service desk",
    description: "Tracks customer issues and internal follow-ups with explicit states (escalated, waiting).",
    bullets: ["Triage WAITING_TEAM before WAITING_CUSTOMER.", "Escalate when policy or money is unclear."],
  },
  approvals: {
    title: "Approvals",
    description: "Outbound comms and high-risk actions wait for explicit approval in normal modes.",
    bullets: ["Check /communications/pending and vendor outbound pending lists.", "Training mode encourages preview-only behavior."],
  },
  purchasing: {
    title: "Purchasing",
    description: "Purchase list and PO flow from real job demand — not duplicated here.",
    bullets: ["GET /purchasing/list or purchasing views from Control Tower links.", "PO email needs configured vendor addresses."],
  },
  content: {
    title: "Content",
    description: "Daily social draft lifecycle: draft → approve → post.",
    bullets: ["GET /content/today", "Demo posts are labeled isDemo and safe to clear."],
  },
  "command-console": {
    title: "Command console",
    description: "POST /command with { \"input\": \"...\" } — natural language into the same pipeline as automation.",
    bullets: [
      "Responses use a standard envelope: success, type, summary, data, intent.",
      "Ask setup questions: “What is left to set up?”, “Show printer guide.”",
    ],
  },
};

function getHelpContent(sectionKey) {
  const k = String(sectionKey || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, "-");
  const hit = SECTIONS[k];
  if (!hit) {
    return {
      title: "Help",
      description: `No help section "${sectionKey}". Try: control-tower, printer-board, service-desk, approvals, purchasing, content, command-console.`,
      bullets: ["GET /setup/status for first-run", "GET /setup/guides/OWNER"],
    };
  }
  return { title: hit.title, description: hit.description, bullets: hit.bullets.slice() };
}

module.exports = { getHelpContent, SECTIONS };
