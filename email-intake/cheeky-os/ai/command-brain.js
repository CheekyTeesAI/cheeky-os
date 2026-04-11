/**
 * Cheeky OS — AI command brain.
 * Parses natural-language commands into structured actions using gpt-4o-mini.
 * Falls back gracefully when OPENAI_API_KEY is not set.
 *
 * @module cheeky-os/ai/command-brain
 */

const { logger } = require("../utils/logger");
const { fetchSafe } = require("../utils/fetchSafe");

const ALLOWED_ACTIONS = [
  "run_followups",
  "get_hot",
  "get_unpaid",
  "get_next",
  "create_invoice",
];

/**
 * Parse a text command into a structured action via OpenAI.
 * @param {string} text
 * @returns {Promise<{ action: string, confidence: number }>}
 */
async function parseCommand(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[COMMAND-BRAIN] OPENAI_API_KEY not set — skipping AI parse");
    return { action: "unknown", confidence: 0 };
  }

  const systemPrompt = `You are Cheeky OS. Convert user command into structured intent.

Allowed actions:
- run_followups
- get_hot
- get_unpaid
- get_next
- create_invoice

Return JSON only:
{
  "action": "",
  "confidence": 0
}

Rules:
- "follow up", "chase", "followups" → run_followups
- "hot deals", "hot", "big deals" → get_hot
- "unpaid", "open deals", "outstanding" → get_unpaid
- "next", "what's next", "next actions" → get_next
- "invoice", "bill", "send invoice" → create_invoice
- Anything unclear → action: "unknown", confidence: 0

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
      max_tokens: 100,
    }),
  });

  if (!result.ok) {
    logger.error("[COMMAND-BRAIN] OpenAI call failed: " + result.error);
    return { action: "unknown", confidence: 0 };
  }

  try {
    const content = result.data.choices[0].message.content.trim();
    const parsed = JSON.parse(content);

    if (!ALLOWED_ACTIONS.includes(parsed.action)) {
      parsed.action = "unknown";
      parsed.confidence = 0;
    }

    logger.info(`[COMMAND-BRAIN] "${text}" → ${parsed.action} (${parsed.confidence})`);
    return {
      action: parsed.action || "unknown",
      confidence: parsed.confidence || 0,
    };
  } catch (err) {
    logger.error("[COMMAND-BRAIN] Failed to parse OpenAI response: " + err.message);
    return { action: "unknown", confidence: 0 };
  }
}

module.exports = { parseCommand, ALLOWED_ACTIONS };
