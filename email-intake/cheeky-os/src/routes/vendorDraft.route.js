"use strict";

const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const createVendorOrderDraftAction = require("../actions/createVendorOrderDraftAction");

router.get("/api/operator/vendor-drafts", async (_req, res) => {
  try {
    let drafts = [];
    try {
      if (prisma && prisma.vendorOrderDraft && typeof prisma.vendorOrderDraft.findMany === "function") {
        drafts = await prisma.vendorOrderDraft.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
        });
      }
    } catch (_) {}

    return res.json({
      success: true,
      drafts,
    });
  } catch (err) {
    return res.json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

router.post("/api/operator/vendor-drafts/:id/create", async (req, res) => {
  try {
    const result = await createVendorOrderDraftAction(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
