"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");

const operatorQueryRouterLib = require("../operator/operatorQueryRouter");

const router = express.Router();

function actor(req) {
  try {
    if (req.body && req.body.requestedBy) return String(req.body.requestedBy).slice(0, 160);
    const h = req.headers && req.headers["x-actor"];
    return h ? String(h).slice(0, 160) : "http";
  } catch (_e) {
    return "http";
  }
}

router.post("/api/operator/query", async (req, res) => {
  try {
    safety.auditLog({
      eventType: "intelligence_operator_query",
      taskId: null,
      actor: actor(req),
      metadata: {
        route: "/api/operator/query",
        queryPreview:
          req.body && req.body.query
            ? String(req.body.query)
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160)
            : "",
        readOnly: true,
      },
    });
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const q = String(payload.query || "").trim();
    if (!q) {
      return res.status(400).json({
        success: false,
        error: "query_required",
        intent: "",
        confidence: 0,
        answer: "",
        sources: [],
        recommendedNextAction: "",
      });
    }
    const out = await operatorQueryRouterLib.routeOperatorQuery({
      query: q,
      requestedBy: payload.requestedBy,
    });
    return res.status(200).json(Object.assign({}, out));
  } catch (_e) {
    return res.status(500).json({
      success: false,
      error: "route_failed",
      intent: "",
      confidence: 0,
      answer: "",
      sources: [],
      recommendedNextAction: "",
    });
  }
});

module.exports = router;
