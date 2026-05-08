"use strict";
/**
 * Internal quote intelligence — deterministic cost stack + margin discipline.
 * Centralize tunables here; do not scatter defaults across routes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUOTE_RULES = void 0;
exports.calculateMargin = calculateMargin;
exports.classifyQuoteRisk = classifyQuoteRisk;
exports.validateQuoteInput = validateQuoteInput;
exports.calculateQuote = calculateQuote;
exports.buildSquareDraftFromQuote = buildSquareDraftFromQuote;
exports.parseLooseQuoteFromText = parseLooseQuoteFromText;
/** Tunable defaults (cash protection). */
exports.QUOTE_RULES = {
    productionPerUnit: {
        DTG: 4.5,
        DTF: 3.5,
        SCREEN_PRINT: 2.5,
        EMBROIDERY: 5.5,
        UNKNOWN: 4.0,
    },
    screenExtraPerColorPosition: 0.5,
    artFeeDefault: 35,
    rushSurchargePercent: 0.15,
    overheadPerOrder: 20,
    /** Target gross margin on revenue for recommended price: sell = cost / (1 - target). */
    targetMarginOnRevenue: 0.45,
    marginSafeMin: 0.45,
    marginWarningMin: 0.3,
    smallQuantityThreshold: 12,
};
function normMethod(raw) {
    const u = String(raw || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
    if (u === "SCREEN" || u === "SCREENPRINT")
        return "SCREEN_PRINT";
    if (u === "EMBROIDERY" || u === "EMB")
        return "EMBROIDERY";
    if (u === "DTF" || u === "DIRECT_TO_FILM")
        return "DTF";
    if (u === "DTG" || u === "DIRECT_TO_GARMENT")
        return "DTG";
    if (exports.QUOTE_RULES.productionPerUnit[u] != null)
        return u;
    return "UNKNOWN";
}
function productionUnitRate(method, frontColors, backColors) {
    const key = normMethod(method);
    const base = exports.QUOTE_RULES.productionPerUnit[key] ?? exports.QUOTE_RULES.productionPerUnit.UNKNOWN;
    if (key !== "SCREEN_PRINT")
        return base;
    const positions = Math.max(0, frontColors) + Math.max(0, backColors);
    const extra = Math.max(0, positions - 1) * exports.QUOTE_RULES.screenExtraPerColorPosition;
    return base + extra;
}
function calculateMargin(cost, sell) {
    if (!Number.isFinite(sell) || sell <= 0)
        return 0;
    return ((sell - cost) / sell) * 100;
}
function classifyQuoteRisk(marginPercent) {
    const m = marginPercent / 100;
    if (m >= exports.QUOTE_RULES.marginSafeMin)
        return "SAFE";
    if (m >= exports.QUOTE_RULES.marginWarningMin)
        return "WARNING";
    return "DANGER";
}
function roundMoney(n) {
    return Math.round(n * 100) / 100;
}
function validateQuoteInput(input) {
    const q = Number(input.quantity);
    if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) {
        return { ok: false, error: "quantity must be a positive integer" };
    }
    const b = Number(input.blankCost);
    if (!Number.isFinite(b) || b < 0) {
        return { ok: false, error: "blankCost must be a number >= 0" };
    }
    if (!input.productionMethod || !String(input.productionMethod).trim()) {
        return { ok: false, error: "productionMethod is required" };
    }
    return { ok: true };
}
function calculateQuote(input) {
    const v = validateQuoteInput(input);
    if (v.ok === false) {
        throw new Error(v.error);
    }
    const qty = Math.floor(Number(input.quantity));
    const blankUnit = Number(input.blankCost);
    const front = Math.max(0, Math.floor(Number(input.frontColors ?? 0)));
    const back = Math.max(0, Math.floor(Number(input.backColors ?? 0)));
    const ship = Math.max(0, Number(input.shippingCost ?? 0));
    const artNeeded = Boolean(input.artNeeded);
    const rush = Boolean(input.rush);
    const methodNorm = normMethod(input.productionMethod);
    const perUnitProd = productionUnitRate(input.productionMethod, front, back);
    const blankCostTotal = roundMoney(blankUnit * qty);
    const productionCostTotal = roundMoney(perUnitProd * qty);
    const artCost = artNeeded ? exports.QUOTE_RULES.artFeeDefault : 0;
    const subtotal = blankCostTotal + productionCostTotal + artCost + ship + exports.QUOTE_RULES.overheadPerOrder;
    const rushCost = rush ? roundMoney(subtotal * exports.QUOTE_RULES.rushSurchargePercent) : 0;
    const totalEstimatedCost = roundMoney(subtotal + rushCost);
    const target = exports.QUOTE_RULES.targetMarginOnRevenue;
    const recommendedPrice = roundMoney(totalEstimatedCost / (1 - target));
    const pricePerUnit = roundMoney(recommendedPrice / qty);
    const estimatedMarginPercent = roundMoney(calculateMargin(totalEstimatedCost, recommendedPrice));
    const riskLevel = classifyQuoteRisk(estimatedMarginPercent);
    const warnings = [];
    if (estimatedMarginPercent / 100 < exports.QUOTE_RULES.marginSafeMin) {
        warnings.push("Margin below target");
    }
    if (rush && estimatedMarginPercent / 100 < exports.QUOTE_RULES.marginSafeMin) {
        warnings.push("Rush job with low margin");
    }
    if (artNeeded && estimatedMarginPercent < 35) {
        warnings.push("Art required but quote too thin");
    }
    if (qty < exports.QUOTE_RULES.smallQuantityThreshold && estimatedMarginPercent / 100 < 0.4) {
        warnings.push("Small quantity may be underpriced");
    }
    if (riskLevel === "DANGER") {
        warnings.push("Quote flagged as high risk — review before sending");
    }
    return {
        costBreakdown: {
            blankCostTotal,
            productionCostTotal,
            artCost,
            rushCost,
            shippingCost: roundMoney(ship),
            overheadAllocation: exports.QUOTE_RULES.overheadPerOrder,
            totalEstimatedCost,
        },
        recommendedPrice,
        pricePerUnit,
        estimatedMarginPercent,
        riskLevel,
        warnings: [...new Set(warnings)],
        productionMethodNormalized: methodNorm,
    };
}
/**
 * Normalized payload for downstream Square / invoice flows.
 * Does not call Square — use POST /cheeky/invoice/from-quote with mapped fields or
 * POST /square/create-draft-invoice (requires Square customerId).
 */
function buildSquareDraftFromQuote(result, input) {
    const name = String(input.customerName || "Customer").trim() || "Customer";
    const qty = Math.floor(Number(input.quantity));
    const label = `${qty} × ${String(input.productType || "garment").trim()} (${result.productionMethodNormalized})`;
    const total = result.recommendedPrice;
    const deposit = roundMoney(total * 0.5);
    return {
        customerName: name,
        lineItems: [
            {
                name: label,
                quantity: 1,
                amount: total,
            },
        ],
        total,
        suggestedDeposit: deposit,
        hints: {
            invoiceFromQuote: "POST /cheeky/invoice/from-quote",
            notes: "Body: customerName, customerEmail?, quantity, pricePerShirt (use pricePerUnit), total (recommendedPrice), title optional.",
        },
    };
}
/** Best-effort parse for operator one-liners (deterministic). */
function parseLooseQuoteFromText(message) {
    const m = String(message || "");
    const low = m.toLowerCase();
    const qtyMatch = m.match(/\b(\d+)\s*(?:shirt|shirts|hoodie|hoodies|tee|tees|pcs|pieces)\b/i) ||
        m.match(/\b(?:quote|estimate|margin)\s+(?:on\s+)?(\d+)\b/i) ||
        m.match(/\b(\d+)\s+(?:shirt|shirts|hoodie|hoodies)\b/i) ||
        m.match(/\b(\d+)\s*(?:at|with)\b/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : NaN;
    const blankMatch = m.match(/\$?\s*([\d.]+)\s*(?:blank|blanks)/i) ||
        m.match(/blank[s]?\s*(?:at|@)?\s*\$?\s*([\d.]+)/i);
    const blankCost = blankMatch ? parseFloat(blankMatch[1]) : 3.5;
    let productionMethod = "DTF";
    if (/\bdtg\b/i.test(m))
        productionMethod = "DTG";
    else if (/\bdtf\b/i.test(m))
        productionMethod = "DTF";
    else if (/\bscreen\b|screen\s*print/i.test(m))
        productionMethod = "SCREEN_PRINT";
    else if (/\bembroid/i.test(m))
        productionMethod = "EMBROIDERY";
    const artNeeded = /\bart\b|\bsetup\b|\bdigit/i.test(low);
    const rush = /\brush\b|\bexpedited\b|\basap\b/i.test(low);
    if (!Number.isFinite(qty) || qty <= 0)
        return null;
    return {
        customerName: "Operator quote",
        productType: "garment",
        quantity: qty,
        blankCost,
        productionMethod,
        frontColors: 1,
        backColors: 0,
        artNeeded,
        rush,
        shippingCost: 0,
        notes: m.slice(0, 500),
    };
}
