const { listOverdueInvoices } = require("../mocks/squareMock");

function daysOverdueFromDate(dueDate) {
  const dueTs = new Date(dueDate).getTime();
  if (!Number.isFinite(dueTs)) return 0;
  const diffMs = Date.now() - dueTs;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function chooseMessage(daysOverdue, customer, amount) {
  const name = customer || "there";
  const amountText = `$${Number(amount || 0).toFixed(2)}`;
  if (daysOverdue <= 7) {
    return `Friendly reminder: Hi ${name}, just a quick note that ${amountText} is still open. If you need a copy of the invoice or payment link, we can send it right away.`;
  }
  if (daysOverdue <= 14) {
    return `Firm follow-up: Hi ${name}, your balance of ${amountText} is now ${daysOverdue} days overdue. Please submit payment today to avoid production or pickup delays.`;
  }
  return `Final demand: Hi ${name}, your invoice balance of ${amountText} is ${daysOverdue} days overdue and requires immediate payment. Please resolve today.`;
}

function urgencyScore(daysOverdue, amountOwed) {
  const days = Math.max(0, Number(daysOverdue || 0));
  const amountFactor = Math.max(1, Math.round(Number(amountOwed || 0) / 100));
  return Math.min(100, days * 4 + amountFactor);
}

function mockOverdueInvoices() {
  return listOverdueInvoices();
}

async function fetchSquareOverdueInvoices() {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  if (!token) {
    return { success: false, reason: "SQUARE_ACCESS_TOKEN missing", items: [] };
  }

  try {
    const env = String(process.env.SQUARE_ENVIRONMENT || "").trim().toLowerCase();
    const base = env === "sandbox" ? "https://connect.squareupsandbox.com/v2" : "https://connect.squareup.com/v2";
    const response = await fetch(`${base}/invoices?limit=50`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Square-Version": "2025-05-21",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const text = await response.text();
      return { success: false, reason: `Square API error ${response.status}`, detail: text, items: [] };
    }
    const payload = await response.json();
    const invoices = Array.isArray(payload && payload.invoices) ? payload.invoices : [];
    const today = Date.now();
    const overdue = invoices
      .map((inv) => {
        const dueDate = inv && inv.paymentRequests && inv.paymentRequests[0] ? inv.paymentRequests[0].dueDate : null;
        const total = inv && inv.paymentRequests && inv.paymentRequests[0] && inv.paymentRequests[0].computedAmountMoney
          ? Number(inv.paymentRequests[0].computedAmountMoney.amount || 0) / 100
          : 0;
        const status = String(inv && inv.status ? inv.status : "").toUpperCase();
        const customer = inv && inv.primaryRecipient && inv.primaryRecipient.customerId
          ? `Square Customer ${inv.primaryRecipient.customerId.slice(0, 6)}`
          : "Square Customer";
        const dueTs = dueDate ? new Date(dueDate).getTime() : today;
        return {
          id: inv && inv.id ? inv.id : `INV-${Math.random().toString(36).slice(2, 8)}`,
          customer,
          amount_owed: total,
          due_date: dueDate || new Date(today).toISOString(),
          status,
          due_ts: dueTs,
        };
      })
      .filter((inv) => inv.status !== "PAID" && inv.status !== "CANCELED" && inv.due_ts < today);
    return { success: true, reason: null, items: overdue };
  } catch (error) {
    return {
      success: false,
      reason: error && error.message ? error.message : "Square fetch failed",
      items: [],
    };
  }
}

async function runCollections(_payload) {
  try {
    const square = await fetchSquareOverdueInvoices();
    const baseItems = square.success && Array.isArray(square.items) && square.items.length > 0
      ? square.items
      : mockOverdueInvoices();
    const items = baseItems.map((inv) => {
      const daysOverdue = daysOverdueFromDate(inv.due_date);
      const amountOwed = Number(inv.amount_owed || 0);
      return {
        id: inv.id,
        customer: inv.customer,
        amount_owed: amountOwed,
        days_overdue: daysOverdue,
        message: chooseMessage(daysOverdue, inv.customer, amountOwed),
        urgency_score: urgencyScore(daysOverdue, amountOwed),
      };
    });
    return {
      success: true,
      mocked: !(square.success && Array.isArray(square.items) && square.items.length > 0),
      source: square.success ? "square" : "mock",
      reason: square.success ? null : square.reason,
      items,
    };
  } catch (error) {
    console.error("[collectionsService] runCollections failed:", error && error.message ? error.message : error);
    const fallback = mockOverdueInvoices().map((inv) => {
      const daysOverdue = daysOverdueFromDate(inv.due_date);
      const amountOwed = Number(inv.amount_owed || 0);
      return {
        id: inv.id,
        customer: inv.customer,
        amount_owed: amountOwed,
        days_overdue: daysOverdue,
        message: chooseMessage(daysOverdue, inv.customer, amountOwed),
        urgency_score: urgencyScore(daysOverdue, amountOwed),
      };
    });
    return {
      success: true,
      mocked: true,
      source: "mock",
      reason: error && error.message ? error.message : "collections fallback",
      items: fallback,
    };
  }
}

function getOverdueInvoices(invoices) {
  try {
    const list = Array.isArray(invoices) ? invoices : [];
    const now = Date.now();
    return list
      .filter((inv) => {
        if (!inv) return false;
        const status = String(inv.status || "").toUpperCase();
        if (status === "PAID" || status === "CANCELED" || status === "REFUNDED") return false;
        const dueTs = new Date(inv.dueDate || inv.due_date).getTime();
        if (status === "OVERDUE") return true;
        return Number.isFinite(dueTs) && dueTs < now;
      })
      .map((inv) => {
        const dueTs = new Date(inv.dueDate || inv.due_date).getTime();
        const daysLate = Number.isFinite(dueTs) ? Math.max(0, Math.floor((now - dueTs) / (24 * 60 * 60 * 1000))) : 0;
        return {
          id: inv.id || null,
          customer: inv.customer || "Unknown Customer",
          amount: Number(inv.amount || inv.amount_owed || 0),
          daysLate,
        };
      });
  } catch (error) {
    console.error("[collectionsService] getOverdueInvoices failed:", error && error.message ? error.message : error);
    return [];
  }
}

module.exports = {
  runCollections,
  getOverdueInvoices,
};
