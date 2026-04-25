/**
 * Inbound / timeline ops audit — uses adoption event log (append-only JSON).
 */
const { logAdoptionEvent } = require("./adoptionEventLog");

function logInbound(kind, payload) {
  logAdoptionEvent(kind, payload && typeof payload === "object" ? payload : { value: payload });
}

module.exports = { logInbound };
