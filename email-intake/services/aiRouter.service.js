"use strict";
/*
Effort-Level AI Router Service
----------------------------------
This service encapsulates communication with the Anthropic Claude model.
Purpose: Dynamically routes AI prompts based on effort levels.
*/

const fs = require("fs");
const path = require("path");
const winston = require("winston"); // For structured logging
const fetch = require("node-fetch"); // HTTP API requests

const AUDIT_FILE = path.join(__dirname, "..", "data", "audit-trail.jsonl");
const MODEL = "claude-opus-4-7";

async function callAI({ prompt, effort = "high", context = null }) {
  // Construct prompt with optional context.
  const userPrompt = context ? `${context}\n${prompt}` : prompt;

  const effortMap = {
    low: { effort: "low" },
    high: { effort: "high" },
    xhigh: { effort: "xhigh" },
  };

  const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();

  if (!effortMap[effort]) {
    return {
      success: false,
      error: `Invalid effort level: ${effort}`,
      effort,
      model: MODEL,
    };
  }

  if (!apiKey) {
    return {
      success: false,
      error: "Missing Anthropic API key",
      effort,
      model: MODEL,
    };
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
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: effortMap[effort],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      winston.error("AI request failed", payload);
      return {
        success: false,
        error: payload?.error?.message || "AI call failed",
        effort,
        model: MODEL,
      };
    }

    const result = Array.isArray(payload?.content) ? payload.content[0]?.text || "" : "";

    // Write audit entry.
    const entry = {
      ts: new Date().toISOString(),
      type: "ai_call",
      effort,
      model: MODEL,
      promptLength: userPrompt.length,
      success: true,
    };
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`);

    // Logging
    winston.info("AI call complete", {
      route: "aiRouter",
      effort,
      promptLength: userPrompt.length,
    });

    return {
      success: true,
      result,
      effort,
      model: MODEL,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Write audit entry for failure.
    const entry = {
      ts: new Date().toISOString(),
      type: "ai_call",
      effort,
      model: MODEL,
      promptLength: userPrompt.length,
      success: false,
      error: errorMessage,
    };
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`);

    winston.error("AI call encountered an exception", {
      effort,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      effort,
      model: MODEL,
    };
  }
}

module.exports = { callAI };