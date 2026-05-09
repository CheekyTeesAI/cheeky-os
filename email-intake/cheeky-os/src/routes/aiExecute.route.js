"use strict";

const express = require("express");
const router = express.Router();
const execute = require("../ai/execute");
/** Sonnet 4 — use API-listed id (Anthropic returns 404 for retired ids like claude-sonnet-4-20250514). */
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

async function runAnthropicPrompt(prompt) {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload && payload.error && payload.error.message ? payload.error.message : "Anthropic request failed",
      };
    }
    const first = Array.isArray(payload && payload.content) ? payload.content[0] : null;
    const text = first && first.type === "text" ? String(first.text || "") : "";
    return { ok: true, model: ANTHROPIC_MODEL, text };
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: err && err.message ? err.message : String(err),
    };
  }
}

router.post("/api/ai/execute", async (req, res) => {
  try {
    const prompt = req && req.body ? req.body.prompt : null;
    if (typeof prompt === "string" && prompt.trim()) {
      const aiOut = await runAnthropicPrompt(prompt.trim());
      if (!aiOut.ok) {
        return res.status(aiOut.status || 503).json({ success: false, error: aiOut.error });
      }
      console.log("[AI] /api/ai/execute success model=", aiOut.model);
      return res.json({
        success: true,
        model: aiOut.model,
        text: aiOut.text,
      });
    }

    const command = req && req.body ? req.body.command : null;
    try {
      console.log("[AI] execute request:", String(command || "").slice(0, 120));
    } catch (_) {}

    if (!command) {
      return res.status(400).json({
        success: false,
        error: "Missing command",
      });
    }

    const result = await execute(command);

    return res.json({
      success: true,
      command,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
