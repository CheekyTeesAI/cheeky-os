/**
 * Safe connectivity probes — no real sends, no secrets in results.
 */
const fs = require("fs");
const path = require("path");
const { getInvoices } = require("./squareDataService");
const { getVendorProfiles } = require("./vendorProfileService");
const { isFoundationDbAvailable, getFoundationPrisma } = require("./foundationPrisma");

async function testSquareRead() {
  try {
    const { invoices, mock, reason } = await getInvoices();
    return {
      ok: !mock && Array.isArray(invoices),
      mock: Boolean(mock),
      mode: mock ? "MOCK" : "LIVE",
      reason: mock ? reason || "mock_or_error" : null,
      invoiceCount: Array.isArray(invoices) ? invoices.length : 0,
    };
  } catch (e) {
    return { ok: false, mock: true, mode: "MOCK", reason: e && e.message ? e.message : "square_read_failed" };
  }
}

async function testSquareWritePreview() {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const loc = String(process.env.SQUARE_LOCATION_ID || "").trim();
  if (!token) {
    return { ok: false, mode: "MOCK", reason: "SQUARE_ACCESS_TOKEN missing", writeCapable: false };
  }
  if (!loc) {
    return { ok: false, mode: "DEGRADED", reason: "SQUARE_LOCATION_ID missing", writeCapable: false };
  }
  return {
    ok: true,
    mode: "LIVE_CAPABLE",
    writeCapable: true,
    note: "No write executed — credentials present for invoice/job APIs.",
  };
}

async function testEmailProvider() {
  const key = String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || "").trim();
  if (!key) {
    return { ok: false, mode: "DEGRADED", reason: "RESEND_API_KEY / EMAIL_API_KEY missing" };
  }
  return { ok: true, mode: "LIVE_CAPABLE", note: "API key present — no test send performed." };
}

async function testSMSProvider() {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const tok = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !tok) {
    return { ok: false, mode: "DEGRADED", reason: "Twilio SID/token incomplete" };
  }
  return { ok: true, mode: "LIVE_CAPABLE", note: "Twilio env present — no SMS sent." };
}

async function testStorageAccess() {
  const dirs = [
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "uploads"),
  ];
  const checks = [];
  let allOk = true;
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      const probe = path.join(d, `.write-probe-${Date.now()}.tmp`);
      fs.writeFileSync(probe, "ok", "utf8");
      fs.unlinkSync(probe);
      checks.push({ path: d, writable: true });
    } catch (e) {
      allOk = false;
      checks.push({ path: d, writable: false, error: e && e.message ? e.message : "write_failed" });
    }
  }
  return {
    ok: allOk,
    mode: allOk ? "LIVE" : "DEGRADED",
    checks,
  };
}

async function testVendorConfig() {
  const { vendors } = getVendorProfiles();
  const withEmail = (vendors || []).filter((v) => v && String(v.email || "").trim()).length;
  return {
    ok: withEmail > 0,
    mode: withEmail ? "LIVE_CAPABLE" : "DEGRADED",
    vendorsWithEmail: withEmail,
    totalVendors: (vendors || []).length,
    note: withEmail ? "At least one vendor email from env." : "Set vendor *_EMAIL env vars for outbound PO email.",
  };
}

async function testDatabasePersistence() {
  if (!isFoundationDbAvailable()) {
    return { ok: false, mode: "DEGRADED", reason: "Foundation Prisma client unavailable" };
  }
  const prisma = getFoundationPrisma();
  if (!prisma || typeof prisma.$queryRaw !== "function") {
    return { ok: false, mode: "DEGRADED", reason: "Prisma not queryable" };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, mode: "LIVE" };
  } catch (e) {
    return { ok: false, mode: "DEGRADED", reason: e && e.message ? e.message : "db_ping_failed" };
  }
}

async function runAllProviderTests() {
  const [
    squareRead,
    squareWrite,
    email,
    sms,
    storage,
    vendor,
    database,
  ] = await Promise.all([
    testSquareRead(),
    testSquareWritePreview(),
    testEmailProvider(),
    testSMSProvider(),
    testStorageAccess(),
    testVendorConfig(),
    testDatabasePersistence(),
  ]);
  return {
    squareRead,
    squareWrite,
    email,
    sms,
    storage,
    vendor,
    database,
    time: new Date().toISOString(),
  };
}

module.exports = {
  testSquareRead,
  testSquareWritePreview,
  testEmailProvider,
  testSMSProvider,
  testStorageAccess,
  testVendorConfig,
  testDatabasePersistence,
  runAllProviderTests,
};
