/**
 * Resolve outbound contact from intake / job / customer store — never invent addresses.
 */
const { getCustomerById, readStore } = require("./customerMatchService");

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const s = v != null ? String(v).trim() : "";
    if (s) return s;
  }
  return "";
}

function normalizePhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  return d.length >= 10 ? d : "";
}

function resolveJobContact(job) {
  if (!job || typeof job !== "object") {
    return { customerName: "", customerEmail: null, customerPhone: null, customerId: null };
  }
  let customerId = job.customerId != null ? String(job.customerId) : null;
  let customerEmail = firstNonEmpty(job.customerEmail, job.email);
  let customerPhone = normalizePhone(firstNonEmpty(job.customerPhone, job.phone));
  const customerName = firstNonEmpty(job.customerName, job.customer, "Customer");

  if (customerId) {
    const c = getCustomerById(customerId);
    if (c) {
      customerEmail = customerEmail || firstNonEmpty(c.email);
      customerPhone = customerPhone || normalizePhone(c.phone);
    }
  }
  return { customerName, customerEmail: customerEmail || null, customerPhone: customerPhone || null, customerId };
}

function resolveIntakeContact(rec) {
  if (!rec || typeof rec !== "object") {
    return { customerName: "", customerEmail: null, customerPhone: null, customerId: null };
  }
  const ex = rec.extractedData && typeof rec.extractedData === "object" ? rec.extractedData : {};
  let customerId = rec.customerId != null ? String(rec.customerId) : null;
  let name = firstNonEmpty(ex.customerName, ex.name, "Customer");
  let customerEmail = firstNonEmpty(ex.email, ex.customerEmail);
  let customerPhone = normalizePhone(firstNonEmpty(ex.phone, ex.customerPhone));
  if (customerId) {
    const c = getCustomerById(customerId);
    if (c) {
      name = firstNonEmpty(c.name, name);
      customerEmail = customerEmail || firstNonEmpty(c.email);
      customerPhone = customerPhone || normalizePhone(c.phone);
    }
  }
  return {
    customerName: name,
    customerEmail: customerEmail || null,
    customerPhone: customerPhone || null,
    customerId,
  };
}

function emailOk(e) {
  return typeof e === "string" && e.includes("@") && e.length > 3;
}

module.exports = {
  resolveJobContact,
  resolveIntakeContact,
  emailOk,
  readStore,
};
