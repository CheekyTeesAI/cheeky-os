/**
 * Role-specific quick guides — static structured content.
 */

const GUIDES = {
  OWNER: [
    { step: 1, title: "Open Control Tower", instruction: "GET / or GET /control-tower for one-screen business snapshot." },
    { step: 2, title: "Review approvals", instruction: "Check Approvals: communications pending and PO/vendor approvals before anything sends." },
    { step: 3, title: "Query status", instruction: "Use POST /command with questions like “What is escalated?” or “Show pending approval.”" },
    { step: 4, title: "Handle exceptions", instruction: "Alerts strip shows critical items only — fix RED health, escalations, failed sends, overdue money." },
  ],
  PRINTER: [
    { step: 1, title: "Open printer board", instruction: "GET /shop/board or your operator printer view for ready / blocked / in production." },
    { step: 2, title: "Start work", instruction: "Use task actions (start) on the next READY job your role owns." },
    { step: 3, title: "Mark complete", instruction: "Complete tasks when the physical work is done so scheduling stays honest." },
    { step: 4, title: "Flag issues", instruction: "Block or flag when art, garments, or customer confirmation is missing — do not guess." },
  ],
  ADMIN: [
    { step: 1, title: "Service desk", instruction: "GET /service-desk — clear WAITING_TEAM first, then customer-waiting items." },
    { step: 2, title: "Send approved messages", instruction: "Only send communications that are approved and previewed; training mode keeps risk low." },
    { step: 3, title: "Update payments", instruction: "Use finance / Square views to match deposits and unblock production." },
    { step: 4, title: "Mark pickup ready", instruction: "When jobs are complete and paid, mark ready for customer pickup per your workflow." },
  ],
  DESIGN: [
    { step: 1, title: "Art-needed queue", instruction: "Find jobs blocked on art from production or service desk links." },
    { step: 2, title: "Upload / approve art", instruction: "Attach proofs through the normal art pipeline; avoid side-channel files." },
    { step: 3, title: "Request revision", instruction: "If customer input is unclear, open a service item instead of informal threads." },
  ],
};

function getWorkflowGuides(role) {
  const r = String(role || "OWNER").toUpperCase();
  const guide = GUIDES[r] || GUIDES.OWNER;
  return { role: r, guide };
}

module.exports = { getWorkflowGuides, GUIDES };
