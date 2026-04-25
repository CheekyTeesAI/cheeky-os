"use strict";

const express = require("express");
const router = express.Router();
const salesEngine = require("../operator/salesEngine");

router.get("/api/operator/sales", async (_req, res) => {
  try {
    const data = await salesEngine();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
