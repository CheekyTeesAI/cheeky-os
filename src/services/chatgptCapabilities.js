"use strict";

function canReadSystemStatus() {
  return true;
}

function canReadPipeline() {
  return true;
}

function canReadPayments() {
  return true;
}

function canCreateDrafts() {
  return true;
}

function canTriggerInternalActions() {
  return true;
}

function canTouchExternalSystems() {
  return false;
}

function getChatGPTCapabilities() {
  return {
    chatgptIntegration: true,
    read: {
      systemStatus: canReadSystemStatus(),
      readiness: true,
      sales: true,
      pipeline: canReadPipeline(),
      payments: canReadPayments(),
      releaseQueue: true,
      vendorDrafts: true,
    },
    actions: {
      createInternalTask: canTriggerInternalActions(),
      createDraftEstimate: canCreateDrafts(),
      createDraftInvoice: canCreateDrafts(),
      markBlanksOrdered: canTriggerInternalActions(),
      evaluateRelease: canTriggerInternalActions(),
    },
    restrictions: {
      externalMessaging: false,
      autoSendInvoices: false,
      autoPlaceVendorOrders: false,
      autoChargeCards: false,
    },
  };
}

module.exports = {
  getChatGPTCapabilities,
  canReadSystemStatus,
  canReadPipeline,
  canReadPayments,
  canCreateDrafts,
  canTriggerInternalActions,
  canTouchExternalSystems,
};
