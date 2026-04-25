const { getArtQueue, updateArtStatus } = require("./artOpsService");

function getArtReviewQueue() {
  return getArtQueue().filter((r) => r && (r.status === "REVIEW_NEEDED" || r.status === "UPLOADED"));
}

function getArtWaitingCustomerApproval() {
  return getArtQueue().filter((r) => r && r.status === "CUSTOMER_APPROVAL_NEEDED");
}

function getPrintReadyArt() {
  return getArtQueue().filter((r) => r && r.status === "PRINT_READY");
}

function moveArtStatus(artFileId, newStatus) {
  return updateArtStatus(artFileId, newStatus);
}

module.exports = {
  getArtReviewQueue,
  getArtWaitingCustomerApproval,
  getPrintReadyArt,
  moveArtStatus,
};
