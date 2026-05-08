"use strict";

const express = require("express");

const draftHelpers = require("../drafting/draftOrderHelpers");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/customers/quick-search", async (req, res) => {
  try {
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase()
      .slice(0, 80);
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: { matches: [], note: "Type at least 2 letters — Phase 5 portal prep hook stays read-only." },
      });
    }

    const rows = await draftHelpers.loadOrdersForDrafts(420);
    const matches = [];

    rows.forEach((o) => {
      if (!o) return;
      const nm = String(o.customerName || "").toLowerCase();
      const em = String(o.email || "").toLowerCase();
      if (!(nm.includes(q) || em.includes(q))) return;
      const key = `${em}|${nm}`;
      if (matches.some((m) => m.key === key)) return;
      matches.push({
        key,
        customerName: String(o.customerName || "").slice(0, 120),
        email: String(o.email || "").slice(0, 160),
        lastStatus: String(o.status || ""),
        hint: "Read-only cockpit hook — Phase 5 customer portal groundwork.",
      });
    });

    return res.json({ success: true, data: { matches: matches.slice(0, 12), query: q } });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Customer search paused safely.", technicalCode: "cust_search_fail" }), {
        data: { matches: [] },
      })
    );
  }
});

module.exports = router;
