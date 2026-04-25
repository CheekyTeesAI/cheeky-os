/**
 * Customer match / create — file-backed when no Prisma Customer model.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "customers.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(STORE, JSON.stringify({ customers: [] }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function readStore() {
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return Array.isArray(doc.customers) ? doc.customers : [];
  } catch (_e) {
    return [];
  }
}

function writeStore(customers) {
  ensureFile();
  fs.writeFileSync(STORE, JSON.stringify({ customers }, null, 2), "utf8");
}

function normEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function normPhone(s) {
  return String(s || "").replace(/\D/g, "");
}

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function similarity(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const words = (s) => new Set(s.split(" ").filter(Boolean));
  const wa = words(x);
  const wb = words(y);
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  const union = wa.size + wb.size - inter;
  return union ? inter / union : 0;
}

function findCustomerMatch({ name, email, phone }) {
  const list = readStore();
  const em = normEmail(email);
  const ph = normPhone(phone);
  if (em) {
    const hit = list.find((c) => normEmail(c.email) === em);
    if (hit) {
      return {
        customer: hit,
        matchedBy: "EMAIL",
        confidence: 1,
        reviewRequired: false,
      };
    }
  }
  if (ph && ph.length >= 10) {
    const hit = list.find((c) => normPhone(c.phone) === ph);
    if (hit) {
      return {
        customer: hit,
        matchedBy: "PHONE",
        confidence: 0.95,
        reviewRequired: false,
      };
    }
  }
  const nm = normName(name);
  if (nm.length >= 3) {
    let best = null;
    let bestScore = 0;
    for (const c of list) {
      const sc = similarity(name, c.name);
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    if (best && bestScore >= 0.72) {
      return {
        customer: best,
        matchedBy: "NAME",
        confidence: Math.min(0.9, bestScore),
        reviewRequired: bestScore < 0.85,
      };
    }
  }
  return {
    customer: null,
    matchedBy: "NEW",
    confidence: 0,
    reviewRequired: false,
  };
}

function createCustomerIfNeeded(data) {
  const list = readStore();
  const name = String((data && data.name) || "Unknown").trim() || "Unknown";
  const email = data && data.email != null ? String(data.email).trim() : "";
  const phone = data && data.phone != null ? String(data.phone).trim() : "";
  const company = data && data.company != null ? String(data.company).trim() : "";
  const notes = data && data.notes != null ? String(data.notes).trim() : "";
  const now = new Date().toISOString();
  const id = `CUS-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const row = {
    id,
    name,
    email: email || null,
    phone: phone || null,
    company: company || null,
    notes: notes || null,
    createdAt: now,
    updatedAt: now,
  };
  list.push(row);
  writeStore(list);
  return row;
}

function getOrCreateCustomer(data) {
  const match = findCustomerMatch({
    name: data && data.name,
    email: data && data.email,
    phone: data && data.phone,
  });
  if (match.customer) {
    const list = readStore();
    const idx = list.findIndex((c) => c.id === match.customer.id);
    if (idx >= 0) {
      const u = { ...list[idx], updatedAt: new Date().toISOString() };
      if (data && data.company && !u.company) u.company = String(data.company);
      if (data && data.notes) u.notes = [u.notes, String(data.notes)].filter(Boolean).join(" | ").slice(0, 4000);
      list[idx] = u;
      writeStore(list);
      return {
        customer: u,
        matchedBy: match.matchedBy,
        confidence: match.confidence,
        reviewRequired: match.reviewRequired,
      };
    }
    return match;
  }
  const c = createCustomerIfNeeded(data);
  return {
    customer: c,
    matchedBy: "NEW",
    confidence: 1,
    reviewRequired: false,
  };
}

function getCustomerById(id) {
  const p = String(id || "").trim();
  if (!p) return null;
  const list = readStore();
  return list.find((c) => c && c.id === p) || null;
}

module.exports = {
  findCustomerMatch,
  createCustomerIfNeeded,
  getOrCreateCustomer,
  readStore,
  getCustomerById,
};
