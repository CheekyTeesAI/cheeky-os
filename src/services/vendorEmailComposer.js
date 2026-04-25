/**
 * Compose outbound vendor PO emails (no send).
 */

function composeVendorEmail({ vendor, po, shipTo, attachments }) {
  const v = vendor || {};
  const p = po || {};
  const st = shipTo || {};
  const fmt = String(v.poFormat || "STANDARD").toUpperCase();

  const lines = Array.isArray(p.items)
    ? p.items.map((it) => `  • ${it.sku || it.product} — ${it.color || ""} / ${it.size || ""} — qty ${it.qty || 0}`)
    : [];

  if (fmt === "BULLSEYE") {
    return {
      subject: `Direct-ship garment PO ${p.poNumber || ""} — Bullseye / Cheeky Tees`,
      body: [
        `Hello ${v.name || "team"},`,
        ``,
        `Please ship the following blanks directly to our production partner:`,
        ``,
        `${st.shipToName || ""}`,
        `${st.address1 || ""}`,
        `${st.city || ""}, ${st.state || ""} ${st.zip || ""}`,
        ``,
        `PO: ${p.poNumber || ""}`,
        `Linked jobs (reference): ${(p.linkedJobs || []).join(", ") || "—"}`,
        ``,
        ...lines,
        ``,
        `Total units: ${p.totalUnits || 0}`,
        ``,
        `Thank you,`,
        `Cheeky Tees Purchasing`,
      ].join("\n"),
      attachments: attachments || [],
    };
  }

  return {
    subject: `Purchase Order ${p.poNumber || ""} — Cheeky Tees`,
    body: [
      `Hello ${v.name || "team"},`,
      ``,
      `Please process the following purchase order for Cheeky Tees.`,
      ``,
      `Ship to:`,
      `${st.shipToName || ""}`,
      `${st.address1 || ""}`,
      `${st.city || ""}, ${st.state || ""} ${st.zip || ""}`,
      ``,
      ...lines,
      ``,
      `Total units: ${p.totalUnits || 0}`,
      `Notes: ${p.notes || "—"}`,
      ``,
      `Thank you,`,
      `Cheeky Tees Purchasing`,
    ].join("\n"),
    attachments: attachments || [],
  };
}

module.exports = {
  composeVendorEmail,
};
