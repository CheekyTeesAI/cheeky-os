/**
 * POST /api/orders/:id/files/link — attach URL metadata to Order.
 */

const express = require("express");
const path = require("path");

const router = express.Router({ mergeParams: true });

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

function loadComms() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "customerCommsService.js"
    ));
  } catch {
    return null;
  }
}

router.post("/:id/files/link", async (req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.attachOrderFileLinks !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable — run `npm run build`",
    });
  }
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ success: false, error: "id required" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const has =
    body.mockupUrl !== undefined ||
    body.artFileUrl !== undefined ||
    body.proofFileUrl !== undefined;
  if (!has) {
    return res.status(400).json({
      success: false,
      error: "Provide at least one of mockupUrl, artFileUrl, proofFileUrl",
    });
  }
  try {
    const out = await mod.attachOrderFileLinks(id, {
      mockupUrl: body.mockupUrl,
      artFileUrl: body.artFileUrl,
      proofFileUrl: body.proofFileUrl,
    });
    try {
      memoryService.logEvent("file_linked", { orderId: id });
    } catch (_) {}
    return res.json({ success: true, order: out });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Record to update not found") || msg.includes("not found")) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

module.exports = router;
