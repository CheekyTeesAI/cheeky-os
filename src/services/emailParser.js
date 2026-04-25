function extractCustomerName(from) {
  const raw = String(from || "").trim();
  if (!raw) return "Unknown Customer";
  if (raw.includes("<")) {
    return raw.split("<")[0].trim() || "Unknown Customer";
  }
  const at = raw.indexOf("@");
  if (at > 0) {
    return raw.slice(0, at).replace(/[._-]+/g, " ").trim() || "Unknown Customer";
  }
  return raw;
}

function detectIntent(subject, body) {
  const text = `${subject} ${body}`.toLowerCase();
  if (text.includes("invoice") || text.includes("pay") || text.includes("payment")) return "PAYMENT";
  if (text.includes("rush")) return "RUSH_ORDER";
  if (text.includes("quote") || text.includes("how much")) return "QUOTE_REQUEST";
  if (text.includes("order")) return "ORDER_REQUEST";
  return "GENERAL_INQUIRY";
}

function detectProductInterest(body) {
  const text = String(body || "").toLowerCase();
  if (text.includes("hat")) return "HATS";
  if (text.includes("hoodie")) return "HOODIES";
  if (text.includes("dtf")) return "DTF_PRINT";
  if (text.includes("screen")) return "SCREEN_PRINT";
  if (text.includes("shirt")) return "SHIRTS";
  return "APPAREL";
}

function detectUrgency(subject, body) {
  const text = `${subject} ${body}`.toLowerCase();
  if (text.includes("asap") || text.includes("rush") || text.includes("today")) return 5;
  if (text.includes("this week")) return 4;
  if (text.includes("soon")) return 3;
  return 2;
}

function suggestedAction(intent, urgency) {
  if (intent === "PAYMENT") return "EMAIL_COLLECTIONS";
  if (urgency >= 5) return "CALL_NOW";
  if (intent === "QUOTE_REQUEST") return "SEND_QUOTE";
  if (intent === "ORDER_REQUEST") return "TEXT_FOLLOW_UP";
  return "EMAIL_RESPONSE";
}

function parseEmailPayload(payload) {
  try {
    const source = payload && typeof payload === "object" ? payload : {};
    const from = String(source.from || "").trim();
    const subject = String(source.subject || "").trim();
    const body = String(source.body || "").trim();
    const intent = detectIntent(subject, body);
    const urgency = detectUrgency(subject, body);
    return {
      success: true,
      parsed: {
        intent,
        customer_name: extractCustomerName(from),
        product_interest: detectProductInterest(body),
        urgency,
        suggested_action: suggestedAction(intent, urgency),
      },
    };
  } catch (error) {
    console.error("[emailParser] parseEmailPayload failed:", error && error.message ? error.message : error);
    return {
      success: false,
      parsed: {
        intent: "GENERAL_INQUIRY",
        customer_name: "Unknown Customer",
        product_interest: "APPAREL",
        urgency: 2,
        suggested_action: "EMAIL_RESPONSE",
      },
      error: error && error.message ? error.message : "parse error",
    };
  }
}

function extractQuantities(text) {
  const out = [];
  const src = String(text || "");
  const regex = /(\d{1,4})\s*(?:x|\*|\-)?\s*(shirts?|tees?|hoodies?|hats?|caps?|polos?|jackets?|jerseys?|sweatshirts?|tanks?|bags?)/gi;
  let match;
  while ((match = regex.exec(src)) !== null) {
    const qty = Number(match[1]);
    const garment = match[2].toLowerCase().replace(/s$/, "").toUpperCase();
    if (Number.isFinite(qty) && qty > 0) out.push({ qty, garment });
  }
  return out;
}

function detectPrintType(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("screen print") || t.includes("screenprint")) return "SCREEN";
  if (t.includes("dtf")) return "DTF";
  if (t.includes("dtg")) return "DTG";
  if (t.includes("heat press") || t.includes("vinyl")) return "HEAT_PRESS";
  if (t.includes("embroider")) return "EMBROIDERY";
  return "UNKNOWN";
}

function detectGarment(text, quantities) {
  if (Array.isArray(quantities) && quantities.length > 0) return quantities[0].garment;
  const t = String(text || "").toLowerCase();
  if (t.includes("hoodie")) return "HOODIE";
  if (t.includes("hat") || t.includes("cap")) return "HAT";
  if (t.includes("polo")) return "POLO";
  if (t.includes("shirt") || t.includes("tee")) return "SHIRT";
  return "APPAREL";
}

function extractNotes(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const firstNewline = t.indexOf("\n\n");
  if (firstNewline > 0 && firstNewline < 300) return t.slice(0, firstNewline).trim();
  return t.length > 240 ? `${t.slice(0, 237)}...` : t;
}

function guessCustomerFromRaw(raw) {
  const text = String(raw || "");
  const fromLine = text.match(/from\s*:\s*([^\n<]+)(?:<[^>]+>)?/i);
  if (fromLine && fromLine[1]) return fromLine[1].trim();
  const nameLine = text.match(/(?:my name is|this is|regards,|thanks,|thank you,)\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  if (nameLine && nameLine[1]) return nameLine[1].trim();
  return "Unknown Customer";
}

function parseEmail(rawText) {
  try {
    const text = String(rawText || "");
    const quantities = extractQuantities(text);
    const printType = detectPrintType(text);
    const garment = detectGarment(text, quantities);
    const customer = guessCustomerFromRaw(text);
    const notes = extractNotes(text);
    const totalQty = quantities.reduce((sum, q) => sum + q.qty, 0);
    const lineItems = quantities.length > 0
      ? quantities.map((q) => ({ qty: q.qty, garment: q.garment, printType }))
      : [{ qty: totalQty || 0, garment, printType }];
    return {
      success: true,
      job: {
        customer,
        garment,
        printType,
        productionType: printType,
        quantities,
        totalQty,
        lineItems,
        notes,
        source: "email",
        status: "UNPAID",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  } catch (error) {
    console.error("[emailParser] parseEmail failed:", error && error.message ? error.message : error);
    return {
      success: false,
      job: {
        customer: "Unknown Customer",
        garment: "APPAREL",
        printType: "UNKNOWN",
        productionType: "UNKNOWN",
        quantities: [],
        totalQty: 0,
        lineItems: [],
        notes: "",
        source: "email",
        status: "UNPAID",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      error: error && error.message ? error.message : "parse error",
    };
  }
}

module.exports = {
  parseEmailPayload,
  parseEmail,
};
