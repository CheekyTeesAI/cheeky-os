"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmailIntake = parseEmailIntake;
const US_PHONE = /\b(?:\+?1[-.\s]?)?(?:\((\d{3})\)|(\d{3}))[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g;
const QTY_NEAR_GARMENT = /\b(\d{1,5})\s*(?:pcs?|pieces?|units?|shirts?|tees?|t-?shirts?|hood(?:ie)?s?|sweatshirts?|garments?|items?)\b/gi;
const QTY_AFTER_PHRASE = /\b(?:need|want|order(?:ing)?|looking\s+for|qty\.?|quantity|for)\s*[:\-]?\s*(\d{1,5})\b/gi;
const QTY_FOR_GARMENT = /\bfor\s+(\d{1,5})\s+/gi;
/** Same line / clause: "24 ... tees", "need 12 hoodies" */
const QTY_NEAR_GARMENT_SAME_LINE = /\b(\d{1,5})\b[^\n]{0,72}\b(?:t-?shirts?|tee\b|tees\b|hood(?:ie)?s?|sweatshirts?|polos?|shirts?\b)/gi;
function norm(s) {
    return s.replace(/\r\n/g, "\n").trim();
}
function extractPhone(text) {
    const m = text.match(US_PHONE);
    if (!m || m.length === 0)
        return null;
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 10)
        return m[0].trim();
    if (digits.length === 11 && digits.startsWith("1"))
        return m[0].trim();
    return m[0].trim();
}
function extractQuantity(text) {
    const hay = text.toLowerCase();
    let m;
    const re0 = new RegExp(QTY_NEAR_GARMENT_SAME_LINE.source, QTY_NEAR_GARMENT_SAME_LINE.flags);
    while ((m = re0.exec(hay)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < 100000)
            return { value: n, level: "HIGH" };
    }
    const re1 = new RegExp(QTY_NEAR_GARMENT.source, QTY_NEAR_GARMENT.flags);
    while ((m = re1.exec(hay)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < 100000)
            return { value: n, level: "HIGH" };
    }
    const re2 = new RegExp(QTY_AFTER_PHRASE.source, QTY_AFTER_PHRASE.flags);
    while ((m = re2.exec(hay)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < 100000)
            return { value: n, level: "MEDIUM" };
    }
    const re3 = new RegExp(QTY_FOR_GARMENT.source, QTY_FOR_GARMENT.flags);
    while ((m = re3.exec(hay)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < 100000)
            return { value: n, level: "MEDIUM" };
    }
    return { value: null, level: "LOW" };
}
function detectGarment(text) {
    const t = text.toLowerCase();
    if (/\bhood(?:ie)?s?\b|hooded\s+sweatshirt/.test(t))
        return { type: "HOODIE", level: "HIGH" };
    if (/\bsweatshirt\b/.test(t) && !/hood/.test(t))
        return { type: "CREWNECK", level: "HIGH" };
    if (/\bcrew\s*neck\b/.test(t))
        return { type: "CREWNECK", level: "HIGH" };
    if (/\bpolos?\b/.test(t))
        return { type: "POLO", level: "HIGH" };
    if (/\bt-?shirts?\b|\btees?\b/.test(t))
        return { type: "TEE", level: "HIGH" };
    if (/\bshirts?\b/.test(t) && !/sweatshirt|t-?shirt/.test(t))
        return { type: "TEE", level: "HIGH" };
    return { type: null, level: "LOW" };
}
function detectPrintMethod(text) {
    const t = text.toLowerCase();
    if (/\b(?:screen\s*print|screenprinting|silk\s*screen)\b/.test(t))
        return { method: "SCREEN", level: "HIGH" };
    if (/\bdtf\b/.test(t))
        return { method: "DTF", level: "HIGH" };
    if (/\bdtg\b/.test(t))
        return { method: "DTG", level: "HIGH" };
    if (/\b(?:embroidery|embroidered)\b/.test(t))
        return { method: "EMB", level: "HIGH" };
    return { method: null, level: "LOW" };
}
function extractDollarAmounts(text) {
    const out = [];
    const re = /\$\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const whole = m[1];
        const cents = m[2];
        const n = parseFloat(whole.replace(/,/g, "") + (cents ? `.${cents}` : ""));
        if (Number.isFinite(n) && n > 0 && n < 1000000)
            out.push(n);
    }
    const usd = /\b(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?\s*USD\b/gi;
    while ((m = usd.exec(text)) !== null) {
        const whole = m[1];
        const cents = m[2];
        const n = parseFloat(whole.replace(/,/g, "") + (cents ? `.${cents}` : ""));
        if (Number.isFinite(n) && n > 0 && n < 1000000)
            out.push(n);
    }
    return out;
}
function customerNameFrom(input) {
    const n = norm(input.fromName);
    if (n.length > 0)
        return n;
    const local = norm(input.fromEmail).split("@")[0] ?? "";
    return local || "Unknown";
}
function parseEmailIntake(input) {
    const assumptions = [];
    const subject = norm(input.subject);
    const body = norm(input.body);
    const blob = `${subject}\n${body}`;
    const blobLower = blob.toLowerCase();
    const customerName = customerNameFrom(input);
    const email = norm(input.fromEmail).toLowerCase();
    const phone = extractPhone(blob);
    const qtyRes = extractQuantity(blobLower);
    let quantity = qtyRes.value;
    let quantityConf = qtyRes.level;
    if (quantity === null) {
        assumptions.push("Quantity not clearly stated");
        quantityConf = "LOW";
    }
    let garmentType;
    let garmentConf;
    const gar = detectGarment(blobLower);
    if (gar.type) {
        garmentType = gar.type;
        garmentConf = gar.level;
    }
    else {
        garmentType = "TEE";
        garmentConf = "LOW";
        assumptions.push("Garment type assumed as TEE");
    }
    let printMethod;
    let printConf;
    const pr = detectPrintMethod(blobLower);
    if (pr.method) {
        printMethod = pr.method;
        printConf = pr.level;
    }
    else {
        printMethod = "DTG";
        printConf = "LOW";
        assumptions.push("Print method assumed as DTG");
    }
    const dollars = extractDollarAmounts(blob);
    let quotedAmount = null;
    if (dollars.length === 1) {
        quotedAmount = dollars[0];
        assumptions.push(`Quoted amount taken from explicit price in email: $${quotedAmount}`);
    }
    else if (dollars.length > 1) {
        assumptions.push("Multiple dollar amounts in email; pricing left unset for manual review");
    }
    const estimatedCost = null;
    const requiresManualReview = quantityConf === "LOW" ||
        garmentConf === "LOW" ||
        printConf === "LOW";
    if (requiresManualReview) {
        assumptions.push("Manual review recommended (low confidence on one or more key fields)");
    }
    const notesLines = [
        `Subject: ${subject}`,
        "---",
        body,
    ];
    if (assumptions.length > 0) {
        notesLines.push("--- Parser assumptions ---");
        notesLines.push(...assumptions.map((a) => `• ${a}`));
    }
    const notes = notesLines.join("\n");
    return {
        customerName,
        email,
        phone,
        notes,
        quantity,
        garmentType,
        printMethod,
        quotedAmount,
        estimatedCost,
        assumptions,
        confidence: {
            quantity: quantityConf,
            garmentType: garmentConf,
            printMethod: printConf,
        },
        requiresManualReview,
    };
}
