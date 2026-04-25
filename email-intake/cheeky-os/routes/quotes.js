/**
 * POST /api/quotes/calculate — quote intelligence (loads dist/quoteEngine.js).
 */

const express = require("express");
const path = require("path");

const router = express.Router();
router.use(express.json());

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

function loadQuoteEngine() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "quoteEngine.js"
    ));
  } catch {
    return null;
  }
}

function logQuoteMemory(result, input) {
  try {
    memoryService.logEvent("quote_calculated", {
      quantity: input.quantity,
      productionMethod: result.productionMethodNormalized,
      recommendedPrice: result.recommendedPrice,
      marginPercent: result.estimatedMarginPercent,
      riskLevel: result.riskLevel,
    });
    if (result.warnings && result.warnings.length) {
      memoryService.logEvent("quote_warning_triggered", {
        warnings: result.warnings,
        riskLevel: result.riskLevel,
      });
    }
    if (result.riskLevel === "DANGER" || result.estimatedMarginPercent < 30) {
      memoryService.logEvent("low_margin_quote_detected", {
        marginPercent: result.estimatedMarginPercent,
        recommendedPrice: result.recommendedPrice,
      });
    }
  } catch (_) {}
}

router.post("/calculate", (req, res) => {
  const mod = loadQuoteEngine();
  if (!mod || typeof mod.calculateQuote !== "function") {
    return res.status(503).json({
      success: false,
      error: "Quote engine unavailable — run `npm run build` in email-intake",
    });
  }
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const input = {
      customerName:
        typeof body.customerName === "string" ? body.customerName : "",
      productType:
        typeof body.productType === "string" ? body.productType : "garment",
      quantity: Number(body.quantity),
      blankCost: Number(body.blankCost),
      productionMethod: String(body.productionMethod || "").trim(),
      frontColors:
        body.frontColors != null ? Number(body.frontColors) : undefined,
      backColors: body.backColors != null ? Number(body.backColors) : undefined,
      artNeeded: Boolean(body.artNeeded),
      rush: Boolean(body.rush),
      shippingCost:
        body.shippingCost != null ? Number(body.shippingCost) : undefined,
      notes: typeof body.notes === "string" ? body.notes : "",
    };

    const val = mod.validateQuoteInput(input);
    if (!val.ok) {
      return res.status(400).json({ success: false, error: val.error });
    }

    const quote = mod.calculateQuote(input);
    let squarePrep = null;
    if (typeof mod.buildSquareDraftFromQuote === "function") {
      squarePrep = mod.buildSquareDraftFromQuote(quote, input);
    }

    logQuoteMemory(quote, input);

    return res.json({
      success: true,
      quote: {
        ...quote,
        squarePrep,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

router.get("/rules", (_req, res) => {
  const mod = loadQuoteEngine();
  if (!mod || !mod.QUOTE_RULES) {
    return res.status(503).json({
      success: false,
      error: "Quote engine unavailable — run `npm run build`",
    });
  }
  return res.json({ success: true, rules: mod.QUOTE_RULES });
});

module.exports = router;
