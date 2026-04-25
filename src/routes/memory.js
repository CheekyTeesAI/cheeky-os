"use strict";

const express = require("express");
const router = express.Router();

const { getMemory } = require("../services/memoryService");

router.get("/api/memory/:key", async (req, res) => {
  try {
    const data = await getMemory(req.params.key);
    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "memory_fetch_failed",
    });
  }
});

module.exports = router;
