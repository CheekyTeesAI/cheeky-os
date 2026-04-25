/**
 * Optional OpenAI enrichment — never overwrites high-confidence parser fields.
 */
function mergePreferOriginal(base, patch) {
  const out = { ...base };
  if (!patch || typeof patch !== "object") return out;
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined || v === null || v === "") continue;
    const cur = out[k];
    if (cur === undefined || cur === null || cur === "") {
      out[k] = v;
      continue;
    }
    if (typeof cur === "number" && typeof v === "number" && v > 0) {
      out[k] = cur;
      continue;
    }
    if (Array.isArray(cur) && cur.length && Array.isArray(v)) {
      out[k] = [...new Set([...cur, ...v])];
      continue;
    }
    if (typeof cur === "string" && cur.length > 2) continue;
    out[k] = v;
  }
  return out;
}

/**
 * @param {object} parsed - output of parseIntake
 * @param {object} raw - { subject, body, ... }
 */
async function enrichParsedIntake(parsed, raw) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      enriched: false,
      extractedData: parsed.extractedData || {},
      missingFields: parsed.missingFields || [],
      assumptions: parsed.assumptions || [],
      reviewRequired: Boolean(parsed.reviewRequired),
    };
  }

  try {
    const text = `${String((raw && raw.subject) || "")}\n${String((raw && raw.body) || "")}`.slice(0, 12000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_INTAKE_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Extract print shop order fields as JSON only. Keys: intent, customerName, company, email, phone, quantity, garment, sizes[], colors[], printLocations[], printMethod, dueDate, notes, reorderHints, artworkMention. Use null for unknown. intent must be one of: NEW_ORDER, QUOTE_REQUEST, REORDER, STATUS_REQUEST, ART_SUBMISSION, GENERAL_QUESTION, UNKNOWN.",
          },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      return {
        enriched: false,
        extractedData: parsed.extractedData || {},
        missingFields: parsed.missingFields || [],
        assumptions: [...(parsed.assumptions || []), "ai_enrich_http_skipped"],
        reviewRequired: Boolean(parsed.reviewRequired),
      };
    }
    const data = await res.json();
    const txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    let j = {};
    try {
      j = JSON.parse(String(txt || "{}"));
    } catch (_e) {
      j = {};
    }
    const merged = mergePreferOriginal(parsed.extractedData || {}, j);
    const miss = Array.isArray(parsed.missingFields) ? [...parsed.missingFields] : [];
    return {
      enriched: true,
      extractedData: merged,
      missingFields: miss,
      assumptions: [...(parsed.assumptions || []), "ai_enrichment_applied"],
      reviewRequired: Boolean(parsed.reviewRequired) || String(j.intent || "") === "UNKNOWN",
    };
  } catch (_e) {
    return {
      enriched: false,
      extractedData: parsed.extractedData || {},
      missingFields: parsed.missingFields || [],
      assumptions: [...(parsed.assumptions || []), "ai_enrich_exception_skipped"],
      reviewRequired: Boolean(parsed.reviewRequired),
    };
  }
}

module.exports = { enrichParsedIntake, mergePreferOriginal };
