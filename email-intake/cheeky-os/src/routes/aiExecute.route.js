"use strict";

const express = require("express");
const router = express.Router();
const { callAI } = require("../../services/aiRouter.service.js");

// Updated API route for AI execution with aiRouter integration
router.post("/api/ai/execute", async (req, res) => {
  try {
    const { prompt, effort = "high", context = null } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid prompt",
      });
    }

    // Use aiRouter to handle the AI request
    const aiResponse = await callAI({ prompt, effort, context });

    if (!aiResponse.success) {
      return res.status(500).json({
        success: false,
        error: aiResponse.error,
      });
    }

    return res.json({
      success: true,
      result: aiResponse.result,
      effort: aiResponse.effort,
      model: aiResponse.model,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

module.exports = router;
