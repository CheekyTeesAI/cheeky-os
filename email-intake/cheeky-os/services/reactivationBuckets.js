/**
 * Bundle 1 — reactivation buckets (read-only, draft / no outbound sends).
 * Uses Prisma marketing Customer when available; falls back to Square customers.
 */

const { getPrisma } = require("../marketing/prisma-client");
const { fetchSquareCustomers } = require("../marketing/square-customers");

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyBuckets() {
  return { hot: [], warm: [], cold: [] };
}

function rowShape(name, phone, email, lastOrder, amount) {
  return {
    name: name || "",
    phone: phone || "",
    email: email || "",
    lastOrder: lastOrder || "",
    amount: amount != null && amount !== "" ? String(amount) : "",
  };
}

function bucketForAgeDays(days) {
  if (days < 30) return "hot";
  if (days <= 90) return "warm";
  return "cold";
}

/**
 * @returns {Promise<{ hot: object[], warm: object[], cold: object[] }>}
 */
async function getReactivationBuckets() {
  const out = emptyBuckets();
  const prisma = getPrisma();
  let rows = [];

  try {
    if (prisma) {
      rows = await prisma.customer.findMany({
        orderBy: { lastOrderDate: "desc" },
      });
    }
  } catch (err) {
    console.error("[reactivationBuckets] Prisma customer read failed:", err.message || err);
  }

  const mapped = [];

  if (rows.length > 0) {
    for (const c of rows) {
      const last = c.lastOrderDate ? new Date(c.lastOrderDate) : null;
      const lastMs = last && Number.isFinite(last.getTime()) ? last.getTime() : 0;
      const days =
        lastMs > 0 ? Math.floor((Date.now() - lastMs) / DAY_MS) : 9999;
      mapped.push({
        ...rowShape(c.name, c.phone, c.email, last ? last.toISOString() : "", c.totalSpent),
        _days: days,
      });
    }
  } else {
    try {
      const sq = await fetchSquareCustomers();
      for (const sc of sq) {
        const name = [sc.given_name, sc.family_name].filter(Boolean).join(" ").trim();
        const email =
          (sc.email_address && (sc.email_address.email_address || sc.email_address)) || "";
        const phone = sc.phone_number || "";
        const created = sc.updated_at || sc.created_at;
        const last = created ? new Date(created) : null;
        const lastMs = last && Number.isFinite(last.getTime()) ? last.getTime() : 0;
        const days =
          lastMs > 0 ? Math.floor((Date.now() - lastMs) / DAY_MS) : 9999;
        mapped.push({
          ...rowShape(name, phone, email, last ? last.toISOString() : "", ""),
          _days: days,
        });
      }
    } catch (err) {
      console.error("[reactivationBuckets] Square customers fallback failed:", err.message || err);
    }
  }

  for (const m of mapped) {
    const { _days, ...rest } = m;
    const bucket = bucketForAgeDays(_days);
    out[bucket].push(rest);
  }

  return out;
}

module.exports = { getReactivationBuckets, emptyBuckets };
