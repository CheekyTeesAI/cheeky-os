"use strict";

const MOCK_LABEL = "mock_fallback";

/** @returns {object} Minimal todaysFocus for mock */
function mockTodaysFocus() {
  return {
    title: "Sample focus — connect DATABASE_URL + Square for live queues (placeholder)",
    priorityOrderId: null,
    priorityScoreApprox: 0,
    hint: null,
    source: MOCK_LABEL,
  };
}

/** @returns {object} keyed normalized sections — all mock */
function mockNormalizedSections() {
  return {
    cash: {
      cards: [
        mockCard({
          id: "mock-inv-001",
          title: "Placeholder · unpaid invoice",
          status: "UNPAID",
          priority: "HIGH",
          stage: "unpaid_invoice",
          customer: "Sample Customer A",
          blocker: null,
          recommendedAction: "Configure Square live reads for real invoice list.",
          approvalRequired: false,
        }),
        mockCard({
          id: "mock-est-002",
          title: "Placeholder · stale estimate follow-up",
          status: "OPEN",
          priority: "NORMAL",
          stage: "estimate_followup",
          blocker: null,
          recommendedAction: "Connect Square or refresh orders search.",
          approvalRequired: false,
        }),
      ],
      sectionSource: MOCK_LABEL,
    },
    intake: {
      cards: [
        mockCard({
          id: "mock-intake-01",
          title: "#SAMPLE · New rush quote",
          status: "INTAKE",
          priority: "RUSH",
          stage: "INTAKE",
          customer: "Sample Org",
          blocker: null,
          recommendedAction: "Quote in Square → send invoice.",
          approvalRequired: false,
        }),
      ],
      sectionSource: MOCK_LABEL,
    },
    art: {
      cards: [
        mockCard({
          id: "mock-art-01",
          title: "#SAMPLE · Art missing",
          status: "QUOTE_ACCEPTED",
          priority: "NORMAL",
          stage: "ART_NEEDED",
          customer: "Sample Org",
          blocker: "Vector file not uploaded",
          recommendedAction: "Request art or queue digitizing.",
          approvalRequired: false,
        }),
      ],
      sectionSource: MOCK_LABEL,
    },
    garments: {
      cards: [
        mockCard({
          id: "mock-gar-01",
          title: "#SAMPLE · Blanks needed",
          status: "APPROVED",
          priority: "NORMAL",
          stage: "GARMENTS_NEEDED",
          customer: "Sample Org",
          blocker: null,
          recommendedAction: "POST /api/garments/create-carolina-made-draft (draft only).",
          approvalRequired: true,
        }),
      ],
      sectionSource: MOCK_LABEL,
    },
    production: {
      cards: [
        mockCard({
          id: "mock-prod-ready",
          title: "#SAMPLE · Ready for floor",
          status: "PRODUCTION_READY",
          priority: "NORMAL",
          stage: "PRODUCTION_READY",
          customer: "Sample Org",
          blocker: null,
          recommendedAction: "Jeremy picks up next from PRODUCTION_READY column.",
          approvalRequired: false,
        }),
        mockCard({
          id: "mock-prod-print",
          title: "#SAMPLE · On press",
          status: "PRINTING",
          priority: "NORMAL",
          stage: "IN_PRODUCTION",
          customer: "Sample Org",
          blocker: null,
          recommendedAction: "Monitor QC handoff.",
          approvalRequired: false,
        }),
      ],
      sectionSource: MOCK_LABEL,
    },
    approvals: {
      cards: [
        mockCard({
          id: "mock-apr-001",
          title: "operator_task · SAMPLE-TASK-ID",
          status: "pending",
          priority: "MEDIUM",
          stage: "APPROVAL_QUEUE",
          customer: null,
          blocker: null,
          recommendedAction: "Use /api/approvals routes when backlog exists.",
          approvalRequired: true,
        }),
      ],
      sectionSource: MOCK_LABEL,
    },
    blocked: {
      cards: [
        mockCard({
          id: "mock-block-01",
          title: "Blocked · Sample Org",
          status: "ON_HOLD",
          priority: "HIGH",
          stage: "ON_HOLD",
          customer: "Sample Org",
          blocker: "Customer requested hold",
          recommendedAction: "Clear blockedReason when unblocked.",
          approvalRequired: false,
        }),
      ],
      sectionSource: MOCK_LABEL,
    },
  };
}

/** @returns {object} */
function mockCard(partial) {
  return Object.assign(
    {
      id: "",
      title: "",
      status: "",
      priority: "",
      stage: "",
      customer: null,
      dueDate: null,
      source: MOCK_LABEL,
      blocker: null,
      recommendedAction: null,
      approvalRequired: false,
    },
    partial
  );
}

module.exports = {
  MOCK_LABEL,
  mockNormalizedSections,
  mockTodaysFocus,
};
