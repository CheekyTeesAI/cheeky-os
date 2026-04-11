const { getSquareRuntimeConfig } = require("../integrations/square");

async function fetchSquareCustomers() {
  const cfg = getSquareRuntimeConfig();
  const token = cfg && cfg.token;
  if (!token) return [];

  const baseUrl = cfg.environment === "sandbox"
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";

  const out = [];
  const seen = new Set();
  let cursor = null;

  while (true) {
    const body = {
      limit: 100,
      sort_field: "CREATED_AT",
      sort_order: "DESC"
    };
    if (cursor) body.cursor = cursor;

    const res = await fetch(`${baseUrl}/customers/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Square-Version": "2025-05-21",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) break;
    const data = await res.json();
    const customers = Array.isArray(data.customers) ? data.customers : [];
    out.push(...customers);

    const nextCursor = typeof data.cursor === "string" ? data.cursor : null;
    if (!nextCursor || seen.has(nextCursor)) break;
    seen.add(nextCursor);
    cursor = nextCursor;
  }

  return out;
}

module.exports = { fetchSquareCustomers };
