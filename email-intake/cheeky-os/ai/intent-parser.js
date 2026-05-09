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
  "GET_UNPAID",
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
params: Extract structured data when present:
- customer: string (business or person name)
- quantity: number
- unitPrice: number
- total: number if explicitly stated

Rules:
- "24 shirts at 18 each" → quantity=24, unitPrice=18
- "invoice John for 500" → customer="John", total=500
- Always return numbers as numbers (not strings)
- If missing, omit field (do NOT guess)

Return ONLY valid JSON in this exact format:

{
  "intent": string,
  "confidence": number,
  "params": {
    "customer"?: string,
    "quantity"?: number,
    "unitPrice"?: number,
    "total"?: number
  }
}

If any parameter exists in the text, it MUST be included in params.
Do not return an empty params object if values are present in the input.


Rules:
- "follow up" or "chase deposits" → RUN_FOLLOWUP
- "quote" or "price" → GENERATE_QUOTE
- "close" or "mark paid" or "done" → CLOSE_DEAL
- "invoice" or "bill" or "send invoice" → CREATE_INVOICE
- "cash" or "money" or "revenue" → GET_CASH_SUMMARY
- "unpaid" or "open deals" or "who owes" → GET_UNPAID
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
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `${systemPrompt}

    You MUST extract ALL available parameters from the text.
    
    Example:
    Input: "create invoice for 24 shirts at 18 each for test customer"
    Output:
    {
      "intent": "CREATE_INVOICE",
      "confidence": 1,
      "params": {
        "customer": "Test Customer",
        "quantity": 24,
        "unitPrice": 18
      }
    }
    
    DO NOT leave params empty if data exists.
    `,
    },
    { 
      role: "user", 
      content: text 
    }
  ],
      temperature: 0.1,
    }),
  });

  if (!result.ok) {
    logger.error("[INTENT] OpenAI call failed: " + result.error);
    return { intent: "UNKNOWN", confidence: 0, params: {} };
  }

  try {
    const content =
      result.data?.choices?.[0]?.message?.content ||
      result.data?.output?.[0]?.content?.[0]?.text ||
      "";

    const parsedText = String(content).trim();
    if (!parsedText) {
      return { intent: "UNKNOWN", confidence: 0, params: {} };
    }

    let parsed;
    try {
      parsed = JSON.parse(parsedText);
    } catch (e) {
      return { intent: "UNKNOWN", confidence: 0, params: {} };
    }

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
