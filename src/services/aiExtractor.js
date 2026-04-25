const { parseEmailPayload } = require("./emailParser");
const { extractIntentFromEmail } = require("../mocks/openaiMock");

async function tryOpenAiExtraction(payload) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      success: true,
      used_ai: false,
      reason: "OPENAI_API_KEY missing; openaiMock active",
      parsed: extractIntentFromEmail(payload),
    };
  }

  const model = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const prompt = [
    "Extract JSON only with keys:",
    "intent, customer_name, product_interest, urgency, suggested_action",
    "Valid intents: QUOTE_REQUEST, ORDER_REQUEST, PAYMENT, RUSH_ORDER, GENERAL_INQUIRY",
    "Email payload:",
    JSON.stringify(payload || {}),
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a strict JSON extractor for business workflows." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      return { success: false, used_ai: false, reason: `openai_http_${response.status}`, detail: text, parsed: null };
    }
    const data = await response.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || "").trim()
      : "";
    const parsed = JSON.parse(content);
    return {
      success: true,
      used_ai: true,
      reason: null,
      parsed: {
        intent: String(parsed.intent || "GENERAL_INQUIRY"),
        customer_name: String(parsed.customer_name || "Unknown Customer"),
        product_interest: String(parsed.product_interest || "APPAREL"),
        urgency: Math.max(1, Number(parsed.urgency || 2)),
        suggested_action: String(parsed.suggested_action || "EMAIL_RESPONSE"),
      },
    };
  } catch (error) {
    return {
      success: true,
      used_ai: false,
      reason: `${error && error.message ? error.message : "openai_parse_failed"}; openaiMock active`,
      parsed: extractIntentFromEmail(payload),
    };
  }
}

async function extractEmailIntent(payload) {
  const ai = await tryOpenAiExtraction(payload);
  if (ai.success && ai.parsed) {
    return { success: true, used_ai: true, parsed: ai.parsed, reason: null };
  }
  const fallback = parseEmailPayload(payload);
  return {
    success: fallback.success,
    used_ai: false,
    parsed: fallback.parsed,
    reason: ai.reason || "rule_fallback",
  };
}

module.exports = {
  extractEmailIntent,
};
