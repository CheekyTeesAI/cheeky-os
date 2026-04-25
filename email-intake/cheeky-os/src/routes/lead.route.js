"use strict";

const express = require("express");
const router = express.Router();
const leadIntake = require("../operator/leadIntake");

router.post("/api/lead", async (req, res) => {
  try {
    const input = req && req.body && typeof req.body === "object" ? req.body : {};
    const result = await leadIntake(input);

    return res.json({
      success: Boolean(result && result.success),
      lead: result && result.lead ? result.lead : null,
      routing: result && result.routing ? result.routing : null,
      pricing: result && result.pricing ? result.pricing : null,
      deposit: result && result.deposit ? result.deposit : null,
      message: `For ${input.quantity || 0} shirts, we recommend ${result && result.routing && result.routing.method ? result.routing.method : "DTG"}. Total: $${result && result.pricing && result.pricing.total != null ? result.pricing.total : 0}`,
      score: result && result.score ? result.score : null,
      quote: result && result.lead ? result.lead.quoteAmount : null,
      suggestedResponse: `Hey ${input.name || ""}, for ${input.quantity || 0} pieces we recommend ${result && result.routing && result.routing.method ? result.routing.method : "DTG"}. Total is around $${result && result.pricing && result.pricing.total != null ? result.pricing.total : 0}, and the required deposit to begin is $${result && result.deposit && result.deposit.depositAmount != null ? result.deposit.depositAmount : 0}.`,
      error: result && result.success ? undefined : result && result.error ? result.error : undefined,
      blocked: result && result.blocked ? true : undefined,
      reasons: result && result.reasons ? result.reasons : undefined,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
