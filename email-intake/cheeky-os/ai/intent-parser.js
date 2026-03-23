/**
 * Cheeky OS — AI intent parser using OpenAI gpt-4o-mini.
 * Takes a natural language command and returns { intent, confidence, params }.
 *
 * @module cheeky-os/ai/intent-parser
 */

const { logger } = require("../utils/logger");
const { fetchSafe } = require("../utils/fetchSafe");

/** Allowed intents the system can handle. */
const ALLOWED_INTENTS = [
  "RUN_FOLLOWUP",
  "GENERATE_QUOTE",
  "CLOSE_DEAL",
  "CREATE_INVOICE",
  "GET_CASH_SUMMARY",
  "GET_PRODUCTION_QUEUE",
  "OUTREACH_LEADS",
  "GET_HEALTH",
  "TRIGGER_BUILD",
  "ROLLBACK",
  "UNKNOWN",
];

/**
 * Parse a natural language command into a structured intent.
 * @param {string} text - The user's command text.
 * @returns {Promise<{ intent: string, confidence: number, params: Object }>}
 */
async function parseIntent(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[INTENT] OPENAI_API_KEY not set — returning UNKNOWN");
    return { intent: "UNKNOWN", confidence: 0, params: {} };
  }

  const systemPrompt = `You are an intent classifier for a t-shirt printing business called Cheeky Tees.
Given a natural language command, return JSON with:
- intent: one of ${ALLOWED_INTENTS.join(", ")}
- confidence: 0.0 to 1.0
- params: any extracted parameters (customer name, amount, etc.)

Rules:
- "follow up" or "chase deposits" → RUN_FOLLOWUP
- "quote" or "price" → GENERATE_QUOTE
- "close" or "mark paid" or "done" → CLOSE_DEAL
- "invoice" or "bill" or "send invoice" → CREATE_INVOICE
- "cash" or "money" or "revenue" → GET_CASH_SUMMARY
- "queue" or "production" or "what's next" → GET_PRODUCTION_QUEUE
- "leads" or "outreach" or "new customers" → OUTREACH_LEADS
- "health" or "status" or "ping" → GET_HEALTH
- "build" or "deploy" or "ship" → TRIGGER_BUILD
- "rollback" or "revert" or "undo" → ROLLBACK
- Anything unclear → UNKNOWN with low confidence

Return ONLY valid JSON. No markdown, no explanation.`;

  const result = await fetchSafe("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });

  if (!result.ok) {
    logger.error("[INTENT] OpenAI call failed: " + result.error);
    return { intent: "UNKNOWN", confidence: 0, params: {} };
  }

  try {
    const content = result.data.choices[0].message.content.trim();
    const parsed = JSON.parse(content);

    // Validate intent is in allowed list
    if (!ALLOWED_INTENTS.includes(parsed.intent)) {
      parsed.intent = "UNKNOWN";
      parsed.confidence = 0;
    }

    logger.info(`[INTENT] "${text}" → ${parsed.intent} (${parsed.confidence})`);
    return {
      intent: parsed.intent,
      confidence: parsed.confidence || 0,
      params: parsed.params || {},
    };
  } catch (err) {
    logger.error("[INTENT] Failed to parse OpenAI response: " + err.message);
    return { intent: "UNKNOWN", confidence: 0, params: {} };
  }
}

module.exports = { parseIntent, ALLOWED_INTENTS };
