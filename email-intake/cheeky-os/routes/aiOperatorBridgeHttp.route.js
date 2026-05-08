"use strict";

const express = require("express");
const path = require("path");
const operatorResponse = require(path.join(__dirname, "..", "..", "src", "ai-operator", "operatorResponse"));

const { runOperatorCommand } = require(path.join(__dirname, "..", "..", "src", "ai-operator", "operatorRouter"));

const router = express.Router();

/**
 * GET /api/operator/test-last-email?contact=Jessica
 */
router.get("/test-last-email", async (req, res) => {
  const contact = String(req.query.contact || "").trim();
  if (!contact) {
    return res.status(400).json(operatorResponse.err("MISSING_CONTACT", "Query parameter `contact` is required (name or email)."));
  }

  try {
    const payload = await runOperatorCommand({
      intent: "GET_LAST_EMAIL_FROM_CONTACT",
      params: { contact },
    });
    const statusCode = payload && payload.ok === false ? 422 : 200;
    return res.status(statusCode).json(payload);
  } catch (err) {
    return res.status(500).json(
      operatorResponse.err("OPERATOR_HTTP_FAILED", err && err.message ? err.message : String(err))
    );
  }
});

module.exports = router;
