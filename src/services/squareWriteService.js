const DEFAULT_UNIT_PRICE = Number(process.env.CHEEKY_DEFAULT_UNIT_PRICE || 15);
const DEFAULT_GARMENT_LABEL = "Custom Apparel";

function resolveSquareBaseUrl() {
  const explicit = String(process.env.SQUARE_ENVIRONMENT || "").trim().toLowerCase();
  if (explicit === "sandbox") return "https://connect.squareupsandbox.com/v2";
  return "https://connect.squareup.com/v2";
}

function squareConfigured() {
  return Boolean(String(process.env.SQUARE_ACCESS_TOKEN || "").trim());
}

function normalizeInvoiceInput(data) {
  const d = data && typeof data === "object" ? data : {};
  const qty = Math.max(0, Math.round(Number(d.qty || d.quantity || 0)));
  const unitPrice = Number.isFinite(Number(d.unitPrice)) && Number(d.unitPrice) > 0 ? Number(d.unitPrice) : DEFAULT_UNIT_PRICE;
  const garment = String(d.garment || d.item || DEFAULT_GARMENT_LABEL);
  const color = d.color ? String(d.color) : null;
  const customer = d.customer ? String(d.customer) : "Unknown Customer";
  const customerEmail = d.customerEmail ? String(d.customerEmail) : null;
  const customerPhone = d.customerPhone ? String(d.customerPhone) : null;
  const notes = d.notes ? String(d.notes) : "";
  const dueDate = d.dueDate ? String(d.dueDate) : null;
  const printMethod = d.printMethod ? String(d.printMethod).toUpperCase() : null;
  const amount = qty > 0 ? Math.round(qty * unitPrice * 100) / 100 : Number(d.amount || 0);
  return { qty, unitPrice, garment, color, customer, customerEmail, customerPhone, notes, dueDate, printMethod, amount };
}

function buildPreview(invoice) {
  const itemLabel = `${invoice.qty} × ${invoice.garment}${invoice.color ? ` (${invoice.color})` : ""}`;
  const lines = [
    `Customer: ${invoice.customer}`,
    `Item:     ${itemLabel}`,
    `Unit:     $${invoice.unitPrice.toFixed(2)}`,
    `Total:    $${invoice.amount.toFixed(2)}`,
  ];
  if (invoice.printMethod) lines.push(`Method:   ${invoice.printMethod}`);
  if (invoice.dueDate) lines.push(`Due:      ${invoice.dueDate}`);
  if (invoice.notes) lines.push(`Notes:    ${invoice.notes}`);
  return lines.join("\n");
}

async function sendToSquare(invoice) {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const locationId = String(process.env.SQUARE_LOCATION_ID || "").trim();
  if (!token) {
    return { success: false, mock: true, reason: "SQUARE_ACCESS_TOKEN missing" };
  }
  if (!locationId) {
    return { success: false, mock: true, reason: "SQUARE_LOCATION_ID missing" };
  }
  try {
    const base = resolveSquareBaseUrl();
    const idempotencyKey = `cheeky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: locationId,
        line_items: [
          {
            name: `${invoice.qty} × ${invoice.garment}${invoice.color ? ` (${invoice.color})` : ""}`,
            quantity: String(invoice.qty || 1),
            base_price_money: {
              amount: Math.round(Number(invoice.unitPrice || 0) * 100),
              currency: "USD",
            },
          },
        ],
      },
    };
    const orderRes = await fetch(`${base}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Square-Version": "2025-05-21",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!orderRes.ok) {
      const detail = await orderRes.text();
      return { success: false, mock: true, reason: `square_order_${orderRes.status}`, detail };
    }
    const orderJson = await orderRes.json();
    return {
      success: true,
      mock: false,
      orderId: orderJson && orderJson.order && orderJson.order.id ? orderJson.order.id : null,
      raw: orderJson,
    };
  } catch (error) {
    return { success: false, mock: true, reason: error && error.message ? error.message : "square_order_failed" };
  }
}

async function createInvoice(data) {
  try {
    const invoice = normalizeInvoiceInput(data);
    const preview = buildPreview(invoice);
    const confirm = Boolean(data && (data.confirm === true || data.confirm === "true"));
    const configured = squareConfigured();

    if (!invoice.qty || invoice.qty <= 0) {
      return {
        success: false,
        mock: true,
        reason: "quantity_required",
        message: "Quantity is required before sending an invoice.",
        invoice,
        preview,
      };
    }

    if (!confirm) {
      console.log("[squareWrite] PREVIEW built, awaiting confirm=true");
      return {
        success: true,
        mock: !configured,
        status: "PREVIEW",
        message: configured
          ? "Preview ready. POST again with { confirm: true } to send to Square."
          : "Preview ready. Square not connected — would send mock invoice with { confirm: true }.",
        invoice,
        preview,
      };
    }

    if (!configured) {
      console.log("[squareWrite] MOCK DATA ACTIVE — Square not connected, invoice not sent");
      return {
        success: true,
        mock: true,
        status: "MOCK_CONFIRMED",
        message: "Invoice not sent — Square not connected.",
        invoice,
        preview,
      };
    }

    const result = await sendToSquare(invoice);
    if (!result.success) {
      console.warn("[squareWrite] Square call failed:", result.reason);
      return {
        success: true,
        mock: true,
        status: "FAILED_LIVE",
        message: `Square returned no order — reason: ${result.reason || "unknown"}. Invoice NOT sent.`,
        invoice,
        preview,
        detail: result.detail || null,
      };
    }

    console.log("[squareWrite] LIVE invoice submitted — order:", result.orderId);
    return {
      success: true,
      mock: false,
      status: "LIVE",
      message: "Order created in Square.",
      invoice,
      preview,
      orderId: result.orderId,
    };
  } catch (error) {
    console.error("[squareWrite] createInvoice failed:", error && error.message ? error.message : error);
    return {
      success: false,
      mock: true,
      reason: error && error.message ? error.message : "create_invoice_error",
      message: "Invoice creation errored. No request sent.",
    };
  }
}

const { getSquareMode } = require("./squareConfigService");
const {
  buildQuotePayloadFromJob,
  buildQuotePayloadFromIntake,
  buildInvoicePayloadFromJob,
} = require("./financialDocumentPrepService");

function prepToInvoiceData(prepPayload) {
  const p = prepPayload && typeof prepPayload === "object" ? prepPayload : {};
  const line = (p.lineItems && p.lineItems[0]) || { name: "Custom", quantity: 1, unitPrice: DEFAULT_UNIT_PRICE };
  const qty = Math.max(1, Number(line.quantity) || 1);
  const unitPrice = Number.isFinite(Number(line.unitPrice)) && Number(line.unitPrice) > 0 ? Number(line.unitPrice) : DEFAULT_UNIT_PRICE;
  return {
    qty,
    unitPrice,
    garment: String(line.name || DEFAULT_GARMENT_LABEL),
    color: null,
    customer: String(p.customerName || "Customer"),
    customerEmail: p.customerEmail || null,
    customerPhone: p.customerPhone || null,
    notes: p.notes ? String(p.notes) : "",
    dueDate: p.dueDate || null,
    printMethod: null,
    amount: Math.round(qty * unitPrice * 100) / 100,
  };
}

async function previewQuoteDraft(payload) {
  const b = payload && typeof payload === "object" ? payload : {};
  const cfg = getSquareMode();
  try {
    let built = null;
    if (b.intakeId) {
      built = await buildQuotePayloadFromIntake(String(b.intakeId));
    } else if (b.jobId) {
      built = await buildQuotePayloadFromJob(String(b.jobId));
    } else {
      return {
        mode: "PREVIEW",
        success: false,
        mock: true,
        created: false,
        squareIds: {},
        previewPayload: null,
        error: "jobId_or_intakeId_required",
      };
    }
    if (!built || !built.payload) {
      return {
        mode: "PREVIEW",
        success: false,
        mock: true,
        created: false,
        squareIds: {},
        previewPayload: built,
        error: (built && built.missingFields && built.missingFields.join(",")) || "prep_failed",
      };
    }
    const inv = prepToInvoiceData(built.payload);
    const previewText = buildPreview(inv);
    return {
      mode: "PREVIEW",
      success: true,
      mock: cfg.mode !== "LIVE",
      created: false,
      squareIds: {},
      previewPayload: { ...built.payload, previewText, missingFields: built.missingFields, readyForSquare: built.readyForSquare },
      error: null,
    };
  } catch (e) {
    return {
      mode: "PREVIEW",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      previewPayload: null,
      error: e && e.message ? e.message : "preview_failed",
    };
  }
}

async function createDraftQuote(payload) {
  const m = String((payload && payload.mode) || "PREVIEW").toUpperCase();
  if (m === "PREVIEW") {
    return previewQuoteDraft(payload);
  }
  if (m !== "CREATE") {
    return {
      mode: "CREATE",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      previewPayload: null,
      error: "invalid_mode",
    };
  }
  const prev = await previewQuoteDraft(payload);
  if (!prev.success || !prev.previewPayload) {
    return { ...prev, mode: "CREATE", created: false };
  }
  const inv = prepToInvoiceData(prev.previewPayload);
  const result = await sendToSquare(inv);
  return {
    mode: "CREATE",
    success: Boolean(result.success),
    mock: Boolean(result.mock),
    created: Boolean(result.success && !result.mock && result.orderId),
    squareIds: { orderId: result.orderId || null },
    previewPayload: prev.previewPayload,
    error: result.success ? null : result.reason || "create_failed",
  };
}

async function previewInvoiceDraft(payload) {
  const b = payload && typeof payload === "object" ? payload : {};
  const cfg = getSquareMode();
  if (!b.jobId) {
    return {
      mode: "PREVIEW",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      previewPayload: null,
      error: "jobId_required",
    };
  }
  const built = await buildInvoicePayloadFromJob(String(b.jobId));
  if (!built || !built.payload) {
    return {
      mode: "PREVIEW",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      previewPayload: built,
      error: "prep_failed",
    };
  }
  const inv = prepToInvoiceData(built.payload);
  const previewText = buildPreview(inv);
  return {
    mode: "PREVIEW",
    success: true,
    mock: cfg.mode !== "LIVE",
    created: false,
    squareIds: {},
    previewPayload: { ...built.payload, previewText, missingFields: built.missingFields, readyForSquare: built.readyForSquare },
    error: null,
  };
}

async function createDraftInvoice(payload) {
  const m = String((payload && payload.mode) || "PREVIEW").toUpperCase();
  if (m === "PREVIEW") {
    return previewInvoiceDraft(payload);
  }
  if (m !== "CREATE") {
    return {
      mode: "CREATE",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      previewPayload: null,
      error: "invalid_mode",
    };
  }
  const prev = await previewInvoiceDraft(payload);
  if (!prev.success) {
    return { ...prev, mode: "CREATE", created: false };
  }
  const inv = prepToInvoiceData(prev.previewPayload);
  const result = await sendToSquare(inv);
  return {
    mode: "CREATE",
    success: Boolean(result.success),
    mock: Boolean(result.mock),
    created: Boolean(result.success && !result.mock && result.orderId),
    squareIds: { orderId: result.orderId || null },
    previewPayload: prev.previewPayload,
    error: result.success ? null : result.reason || "create_failed",
  };
}

module.exports = {
  createInvoice,
  squareConfigured,
  previewQuoteDraft,
  createDraftQuote,
  previewInvoiceDraft,
  createDraftInvoice,
};
