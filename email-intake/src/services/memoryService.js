/**
 * Kaizen / memory — JSON file store (+ optional OpenAI analysis). No DB migration.
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "..", "data", "memory.json");
const MAX_EVENTS = 500;

function loadDoc() {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const j = JSON.parse(raw);
    if (!Array.isArray(j.events)) j.events = [];
    if (!Array.isArray(j.insights)) j.insights = [];
    return j;
  } catch {
    return { events: [], insights: [] };
  }
}

function saveDoc(doc) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(doc, null, 2), "utf8");
}

/**
 * @param {string} type
 * @param {object} [data]
 */
function logEvent(type, data) {
  try {
    const doc = loadDoc();
    doc.events.push({
      timestamp: new Date().toISOString(),
      type: String(type || "unknown"),
      data:
        data != null && typeof data === "object" && !Array.isArray(data)
          ? data
          : { value: data },
    });
    if (doc.events.length > MAX_EVENTS) {
      doc.events = doc.events.slice(-MAX_EVENTS);
    }
    saveDoc(doc);
  } catch (err) {
    console.error("[memoryService] logEvent:", err.message || err);
  }
}

/**
 * @returns {Promise<string>}
 */
async function analyzeMemory() {
  const doc = loadDoc();
  const events = doc.events.slice(-80);
  const payload = JSON.stringify(events, null, 2);

  const prompt = `You are a business optimizer. Analyze these events and identify:
- inefficiencies
- patterns
- missed revenue opportunities
- suggestions

Events (most recent last):
${payload}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback =
      "[Kaizen: set OPENAI_API_KEY for AI insights]\n\n" +
      `Event count: ${doc.events.length}. ` +
      "Review timestamps and types for bottlenecks (e.g. many task_completed without invoice_created).";
    const doc2 = loadDoc();
    doc2.insights.push({
      at: new Date().toISOString(),
      text: fallback,
      source: "heuristic",
    });
    if (doc2.insights.length > 50) doc2.insights = doc2.insights.slice(-50);
    saveDoc(doc2);
    return fallback;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a Kaizen coach for a print shop. Be concise and practical.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 1200,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (body.error && body.error.message) || `OpenAI failed (${res.status})`;
    throw new Error(msg);
  }

  const text =
    body.choices &&
    body.choices[0] &&
    body.choices[0].message &&
    String(body.choices[0].message.content || "").trim();
  if (!text) throw new Error("Empty OpenAI response");

  const doc3 = loadDoc();
  doc3.insights.push({ at: new Date().toISOString(), text, source: "openai" });
  if (doc3.insights.length > 50) doc3.insights = doc3.insights.slice(-50);
  saveDoc(doc3);

  return text;
}

module.exports = { logEvent, analyzeMemory, loadDoc };
