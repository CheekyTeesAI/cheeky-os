function resolveSquareBaseUrl() {
  const explicit = String(process.env.SQUARE_ENVIRONMENT || "").trim().toLowerCase();
  if (explicit === "sandbox") return "https://connect.squareupsandbox.com/v2";
  return "https://connect.squareup.com/v2";
}

function mockInvoiceList() {
  const now = Date.now();
  return [
    {
      id: "INV-MOCK-9001",
      customer: "Pine Creek Church",
      amount: 980,
      status: "OVERDUE",
      dueDate: new Date(now - 16 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "INV-MOCK-9002",
      customer: "Metro Realty Group",
      amount: 640,
      status: "OVERDUE",
      dueDate: new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "INV-MOCK-9003",
      customer: "River Youth Baseball",
      amount: 455,
      status: "UNPAID",
      dueDate: new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "INV-MOCK-9004",
      customer: "Amber HVAC Services",
      amount: 1850,
      status: "UNPAID",
      dueDate: new Date(now).toISOString(),
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "INV-MOCK-9005",
      customer: "Sunrise Bakery",
      amount: 325,
      status: "PAID",
      dueDate: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

function mapSquareStatus(raw, dueDateIso) {
  const s = String(raw || "").toUpperCase();
  if (s === "PAID" || s === "REFUNDED") return "PAID";
  if (s === "CANCELED") return "PAID";
  const dueTs = new Date(dueDateIso).getTime();
  if (Number.isFinite(dueTs) && dueTs < Date.now()) return "OVERDUE";
  return "UNPAID";
}

async function fetchSquareInvoices() {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  if (!token) {
    return { success: true, mock: true, reason: "SQUARE_ACCESS_TOKEN missing", invoices: mockInvoiceList() };
  }
  try {
    const base = resolveSquareBaseUrl();
    const response = await fetch(`${base}/invoices?limit=50`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Square-Version": "2025-05-21",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      return {
        success: true,
        mock: true,
        reason: `square_http_${response.status}`,
        detail,
        invoices: mockInvoiceList(),
      };
    }
    const payload = await response.json();
    const raw = Array.isArray(payload && payload.invoices) ? payload.invoices : [];
    const invoices = raw.map((inv, idx) => {
      const due = inv && inv.paymentRequests && inv.paymentRequests[0] ? inv.paymentRequests[0].dueDate : null;
      const amountCents = inv && inv.paymentRequests && inv.paymentRequests[0] && inv.paymentRequests[0].computedAmountMoney
        ? Number(inv.paymentRequests[0].computedAmountMoney.amount || 0)
        : 0;
      const customerName = inv && inv.primaryRecipient && inv.primaryRecipient.givenName
        ? `${inv.primaryRecipient.givenName} ${inv.primaryRecipient.familyName || ""}`.trim()
        : inv && inv.primaryRecipient && inv.primaryRecipient.customerId
          ? `Square Customer ${String(inv.primaryRecipient.customerId).slice(0, 6)}`
          : "Square Customer";
      return {
        id: inv && inv.id ? inv.id : `INV-LIVE-${idx + 1}`,
        customer: customerName,
        amount: amountCents / 100,
        status: mapSquareStatus(inv && inv.status, due),
        dueDate: due || new Date().toISOString(),
        createdAt: inv && inv.createdAt ? inv.createdAt : new Date().toISOString(),
      };
    });
    return { success: true, mock: false, reason: null, invoices };
  } catch (error) {
    return {
      success: true,
      mock: true,
      reason: error && error.message ? error.message : "square_fetch_failed",
      invoices: mockInvoiceList(),
    };
  }
}

async function getInvoices() {
  const result = await fetchSquareInvoices();
  const mock = Boolean(result && result.mock);
  const reason = result && result.reason ? result.reason : null;
  if (mock) {
    console.log("[squareDataService] MOCK DATA ACTIVE — reason:", reason || "unspecified");
  }
  return {
    invoices: Array.isArray(result && result.invoices) ? result.invoices : [],
    mock,
    reason,
  };
}

module.exports = {
  fetchSquareInvoices,
  getInvoices,
};
