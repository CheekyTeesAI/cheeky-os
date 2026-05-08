"use strict";

/**
 * CHEEKY OS v1.0 — OpenAI quote parser for ct_intake_queue (QUOTE_PENDING).
 * NOT used in Square payment webhooks (see squareWebhookService.ts).
 *
 * Env:
 *   OPENAI_API_KEY (required)
 *   OPENAI_QUOTE_MODEL — default gpt-4o
 *   CHEEKY_QUOTE_PROMPT_PATH — optional override to markdown prompt file
 */

const fs = require("fs");
const path = require("path");
const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

const DEFAULT_MODEL = () =>
  String(process.env.OPENAI_QUOTE_MODEL || "gpt-4o").trim() || "gpt-4o";

function defaultPromptPath() {
  const env = String(process.env.CHEEKY_QUOTE_PROMPT_PATH || "").trim();
  if (env && fs.existsSync(env)) return env;
  return path.join(
    __dirname,
    "..",
    "..",
    "..",
    "docs",
    "cheeky-os-v1-unification",
    "prompts",
    "CHEEKY_TEES_QUOTE_SYSTEM_PROMPT.md"
  );
}

function loadSystemPrompt() {
  const p = defaultPromptPath();
  try {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8");
    }
  } catch (e) {
    logger.warn("[openaiQuoteIntake] prompt read failed: " + (e && e.message ? e.message : e));
  }
  return [
    "You are Cheeky Tees quote AI. Reply with JSON only per schema cheeky_quote_v1",
    "(version, jobName, lineItems[], quotedTotal, depositPercent default 50, depositAmount, etc.).",
    "No markdown. No code fences.",
  ].join(" ");
}

function stripJsonFences(text) {
  let s = String(text || "").trim();
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) s = m[1].trim();
  return s;
}

/**
 * Post-parse validation so downstream invoice code never sees half-shaped objects.
 * @param {object} quote
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateCheekyQuoteV1(quote) {
  const errors = [];
  if (!quote || typeof quote !== "object") {
    return { ok: false, errors: ["quote_not_object"] };
  }
  if (quote.version !== "cheeky_quote_v1") {
    errors.push("version_must_be_cheeky_quote_v1");
  }
  if (!Array.isArray(quote.lineItems)) {
    errors.push("lineItems_must_be_array");
  } else {
    quote.lineItems.forEach((li, i) => {
      if (!li || typeof li !== "object") {
        errors.push(`lineItems[${i}]_not_object`);
        return;
      }
      const desc = li.description;
      if (typeof desc !== "string" || !String(desc).trim()) {
        errors.push(`lineItems[${i}]_missing_description`);
      }
      const qty = Number(li.qty);
      const up = Number(li.unitPrice);
      if (!Number.isFinite(qty)) errors.push(`lineItems[${i}]_qty_not_number`);
      if (!Number.isFinite(up)) errors.push(`lineItems[${i}]_unitPrice_not_number`);
    });
  }
  for (const key of ["subtotal", "quotedTotal", "depositAmount", "depositPercent"]) {
    const v = quote[key];
    if (v != null && !Number.isFinite(Number(v))) {
      errors.push(`${key}_not_numeric`);
    }
  }
  const refusal =
    Array.isArray(quote.lineItems) &&
    quote.lineItems.length === 0 &&
    Number(quote.quotedTotal) === 0;
  if (!refusal && Array.isArray(quote.lineItems) && quote.lineItems.length === 0) {
    errors.push("lineItems_empty_without_refusal");
  }
  return { ok: errors.length === 0, errors };
}

function openAiHttpErrorDetail(data) {
  if (!data || typeof data !== "object") return "";
  const err = data.error;
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * @param {object} opts
 * @param {string} opts.rawCustomerText
 * @param {object} [opts.context] — channel, intakeId, names, etc.
 * @returns {Promise<{ ok: boolean, quote?: object, error?: string, rawContent?: string, usage?: object }>}
 */
async function parseQuoteForIntake(opts) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    return { ok: false, error: "OPENAI_API_KEY not set" };
  }

  const rawCustomerText = String((opts && opts.rawCustomerText) || "").trim();
  if (!rawCustomerText) {
    return { ok: false, error: "rawCustomerText required" };
  }

  const context = (opts && opts.context) || {};
  const system = loadSystemPrompt();
  const userPayload = JSON.stringify(
    {
      context,
      customerMessageOrFormText: rawCustomerText,
    },
    null,
    0
  );

  const body = {
    model: DEFAULT_MODEL(),
    temperature: 0.2,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content:
          "Parse this intake into cheeky_quote_v1 JSON only.\n\nINPUT:\n" + userPayload,
      },
    ],
  };

  const res = await fetchSafe("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify(body),
    timeoutMs: 120000,
  });

  if (!res.ok) {
    const detail = openAiHttpErrorDetail(res.data);
    const base = res.error || "openai_request_failed";
    return {
      ok: false,
      error: detail ? `${base}: ${detail}` : base,
      data: res.data,
    };
  }

  const choice = res.data && res.data.choices && res.data.choices[0];
  const finish =
    choice && choice.finish_reason && String(choice.finish_reason);
  const content =
    choice && choice.message && typeof choice.message.content === "string"
      ? choice.message.content
      : "";

  if (finish === "length") {
    return {
      ok: false,
      error: "openai_truncated_response_retry_or_raise_max_tokens",
      rawContent: content ? String(content).slice(0, 4000) : "",
    };
  }

  let quote;
  try {
    quote = JSON.parse(stripJsonFences(content));
  } catch (e) {
    return {
      ok: false,
      error: "json_parse_failed: " + (e && e.message ? e.message : String(e)),
      rawContent: content.slice(0, 4000),
    };
  }

  if (!quote || quote.version !== "cheeky_quote_v1") {
    return {
      ok: false,
      error: "invalid_quote_schema_or_version",
      rawContent: content.slice(0, 4000),
      quote,
    };
  }

  const checked = validateCheekyQuoteV1(quote);
  if (!checked.ok) {
    return {
      ok: false,
      error: "quote_validation_failed: " + checked.errors.join(", "),
      rawContent: content.slice(0, 4000),
      quote,
      validationErrors: checked.errors,
    };
  }

  return {
    ok: true,
    quote,
    rawContent: content,
    usage: res.data && res.data.usage ? res.data.usage : undefined,
    model: res.data && res.data.model,
  };
}

module.exports = {
  parseQuoteForIntake,
  loadSystemPrompt,
  DEFAULT_MODEL,
};
