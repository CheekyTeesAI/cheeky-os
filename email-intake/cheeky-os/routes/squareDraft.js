/**
 * Bundle 2 — POST /square/create-draft-invoice (mounted at /square).
 */

const path = require("path");
const { Router } = require("express");
const { createDraftInvoice } = require("../services/squareDraftInvoice");
const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

const router = Router();

router.post("/create-draft-invoice", async (req, res) => {
  try {
    const result = await createDraftInvoice(req.body || {});
    if (result.success) {
      try {
        memoryService.logEvent("invoice_created", {
          invoiceId: result.invoiceId || "",
          status: result.status || "DRAFT",
        });
      } catch (_) {
        /* memory optional */
      }
      return res.json({
        success: true,
        invoiceId: result.invoiceId || "",
        status: result.status || "DRAFT",
      });
    }
    return res.json({
      success: false,
      error: result.error || "Unknown error",
    });
  } catch (err) {
    console.error("[square/create-draft-invoice]", err.message || err);
    return res.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

module.exports = router;
