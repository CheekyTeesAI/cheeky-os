"use strict";

const express = require("express");

const customerSearchService = require("../customer/customerSearchService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/customer/search", async (req, res) => {
  try {
    const q = req.query.q || req.query.query || req.query.email || req.query.name || req.query.phone || req.query.order || "";
    const data = await customerSearchService.customerSearchEnvelope(String(q));
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Customer search unavailable safely.", technicalCode: "customer_search_fail" }), {
        data: {
          customer: "pending_review",
          orders: [],
          currentStatus: "pending_review",
          customerFriendlyMessage: "We could not load customer status right now — retry soon through your coordinator.",
          estimatedTimeline: "unknown",
          lastUpdated: new Date().toISOString(),
        },
      })
    );
  }
});

router.get("/api/customer/status", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token)
      return res.status(200).json(
        Object.assign(safeFailureResponse({ safeMessage: "Status link token missing.", technicalCode: "customer_status_token" }), {
          data: null,
        })
      );

    const out = await customerSearchService.lookupByShareToken(token);
    if (!out.ok) {
      return res.status(200).json(
        Object.assign(
          safeFailureResponse({
            safeMessage: "This status link is no longer valid — ask Cheeky for a fresh update.",
            technicalCode: "customer_status_expired",
            fallbackUsed: true,
          }),
          { data: out.data || null, reason: out.reason }
        )
      );
    }

    return res.json({ success: true, data: out.data });
  } catch (_e2) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Status lookup failed safely.", technicalCode: "customer_status_fail" }));
  }
});

module.exports = router;
