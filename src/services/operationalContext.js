/**
 * Unified operational context for responses — never hides BUILD/mock when relevant.
 */
const adoptionStateStore = require("./adoptionStateStore");

const MODES = ["BUILD", "TRAINING", "STAGING", "LIVE"];

/**
 * Fast sync context (env hints only — no network I/O).
 */
function getOperationalContextSync() {
  const st = adoptionStateStore.load();
  const gm = MODES.includes(String(st.globalOperationalMode || "").toUpperCase())
    ? String(st.globalOperationalMode).toUpperCase()
    : "BUILD";
  const squareToken = !!String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const resend = !!String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || "").trim();
  const twilio = !!(
    String(process.env.TWILIO_ACCOUNT_SID || "").trim() && String(process.env.TWILIO_AUTH_TOKEN || "").trim()
  );
  const degraded =
    !squareToken || !resend || !twilio || gm === "BUILD" || gm === "TRAINING";
  const mockHint = !squareToken;
  return {
    globalMode: gm,
    mock: mockHint,
    degraded,
    hints: {
      squareConfigured: squareToken,
      outboundEmailConfigured: resend,
      smsConfigured: twilio,
      trainingMode: !!st.trainingMode,
    },
  };
}

/**
 * Richer context when async invoice check is available (call from routes).
 */
async function getOperationalContextAsync() {
  const base = getOperationalContextSync();
  let squareMock = base.mock;
  try {
    const { getInvoices } = require("./squareDataService");
    const inv = await getInvoices();
    squareMock = Boolean(inv.mock);
  } catch (_e) {
    squareMock = true;
  }
  return {
    ...base,
    mock: squareMock,
    degraded: base.degraded || squareMock,
  };
}

module.exports = {
  getOperationalContextSync,
  getOperationalContextAsync,
  MODES,
};
