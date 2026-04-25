"use strict";

const OpenAI = require("openai");

const ALLOWED_ACTIONS = new Set([
  "CREATE_ORDER",
  "GET_PRODUCTION_QUEUE",
  "RUN_FOLLOWUPS",
  "GET_NEXT_JOB",
  "RUN_SCHEDULE",
  "GET_INSIGHTS",
  "GET_DEALS",
  "UNKNOWN",
]);

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function normalizeParsed(parsed) {
  if (!parsed || typeof parsed !== "object") return { action: "UNKNOWN" };
  const action = String(parsed.action || "UNKNOWN").toUpperCase();
  if (!ALLOWED_ACTIONS.has(action)) return { action: "UNKNOWN" };
  if (action === "CREATE_ORDER") {
    const payload = parsed.payload && typeof parsed.payload === "object" ? parsed.payload : {};
    return {
      action,
      payload: {
        customerName: String(payload.customerName || "Walk-in"),
        quantity: Number(payload.quantity || 1) || 1,
        product: String(payload.product || "T-Shirts"),
      },
    };
  }
  return { action };
}

async function interpret(input) {
  if (!client) return { action: "UNKNOWN" };
  const safeInput = String(input || "").trim();
  if (!safeInput) return { action: "UNKNOWN" };

  const prompt = `
Convert the user request into JSON.

Allowed actions:
CREATE_ORDER
GET_PRODUCTION_QUEUE
RUN_FOLLOWUPS
GET_NEXT_JOB
RUN_SCHEDULE
GET_INSIGHTS
GET_DEALS
UNKNOWN

Return ONLY JSON:
{ "action": "ACTION_NAME", "payload": {} }

For CREATE_ORDER include payload.customerName, optional quantity, optional product.
If unclear, return {"action":"UNKNOWN"}.

User input:
"${safeInput.replace(/"/g, '\\"')}"
`;

  try {
    const res = await client.chat.completions.create({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const content =
      res &&
      res.choices &&
      res.choices[0] &&
      res.choices[0].message &&
      typeof res.choices[0].message.content === "string"
        ? res.choices[0].message.content.trim()
        : "";
    if (!content) return { action: "UNKNOWN" };
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    return normalizeParsed(parsed);
  } catch (_e) {
    return { action: "UNKNOWN" };
  }
}

module.exports = { interpret };
