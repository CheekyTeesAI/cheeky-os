"use strict";

function isControlledMode() {
  return (
    String(process.env.AUTOPILOT || "false").toLowerCase() === "true" &&
    String(process.env.AUTOPILOT_MODE || "").toLowerCase() === "controlled"
  );
}

function canCreateInternalTask() {
  return isControlledMode();
}

function canAdvanceInternalStatus() {
  return isControlledMode();
}

function canSendExternalMessage() {
  return false;
}

function canPlaceVendorOrder() {
  return false;
}

function canTouchSquare() {
  return false;
}

module.exports = {
  isControlledMode,
  canCreateInternalTask,
  canAdvanceInternalStatus,
  canSendExternalMessage,
  canPlaceVendorOrder,
  canTouchSquare,
};
