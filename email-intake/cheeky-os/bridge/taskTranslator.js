"use strict";

/**
 * Rule-based NL → structured task payload (partial; merge with defaults before createTask).
 * NO external LLM.
 */

function slugifyPhrase(s) {
  try {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80)
      .replace(/^-+|-+$/g, "") || "translated-scope";
  } catch (_e) {
    return "translated-scope";
  }
}

function detectIntent(lower) {
  try {
    if (/\brun\s+|execute\s+|^exec\b|\bnpm\b|\bnpx\b|^node\b/.test(lower))
      return { intent: "execute", bump: 0.92 };
    if (/\bnotify\b|^tell\s|^alert\s|^ping\s/.test(lower))
      return { intent: "notify", bump: 0.78 };

    /** build before loose query heuristics (e.g. "Build connector" ≠ question) */

    if (
      /^(build|create|implement|add|migrate|connector|prototype|draft|integration|microsoft\s+graph|graph)\b/.test(lower) ||
      /\b(build|implement|migrate|prototype|connector|integration|microsoft\s+graph)\b/.test(lower)
    )
      return { intent: "build", bump: 0.88 };

    if (/^(how|what|who|when|where|summarize|list|fetch|retrieve|inspect|analyze|audit|dashboard|snapshot|inventory|estimate|sales|cash|square|invoice|paid|due|overview)\b|:?\s*$/.test(lower))
      return { intent: "query", bump: 0.72 };

    return { intent: "query", bump: 0.4 };
  } catch (_e) {
    return { intent: "query", bump: 0.35 };
  }
}

function detectPriority(lower) {
  try {
    if (/\burgent|critical|asap\b/.test(lower)) return { priority: "critical", conf: 0.15 };
    if (/\bhigh priority\b|\bpriority\b.*\bhigh\b/.test(lower)) return { priority: "high", conf: 0.12 };
    if (/\blow priority\b/.test(lower)) return { priority: "low", conf: 0.08 };
    return { priority: "normal", conf: 0 };
  } catch (_e) {
    return { priority: "normal", conf: 0 };
  }
}

function deriveTarget(lower, hint, pickedIntent) {
  try {
    const h = slugifyPhrase(hint);
    if (/graph|microsoft\s+graph|graph\s+connector/.test(lower) && pickedIntent === "build")
      return `graph-email-connector`;
    const firstQuote = /\u201c([^\u201d]+)\u201d|"([^"]+)"|'([^']+)'/;
    const m = firstQuote.exec(lower);
    if (m && (m[1] || m[2] || m[3])) return slugifyPhrase(m[1] || m[2] || m[3]);

    /** strip leading intent fluff */
    const stripped = lower
      .replace(/^(please|pls|could you|would you)\s+/i, "")
      .replace(/^\s*(run|exec|execute|build|implement|summarize)\s+[:\-\s]+/i, "");

    let words = stripped.split(/\s+/).filter(Boolean);
    if (!words.length) return h || "semantic-target";
    if (pickedIntent === "execute" && (words[0] === "npm" || words[0] === "npx" || words[0] === "node"))
      return stripped.slice(0, 420);

    if (pickedIntent !== "execute" && words.length > 16) words = words.slice(-12);
    return slugifyPhrase(words.slice(0, 10).join(" ")) || h || "semantic-target";
  } catch (_e) {
    return "semantic-target";
  }
}

/**
 * @param {string} instruction
 * @param {object=} meta
 */
function translate(instruction, meta) {
  try {
    const raw = instruction != null ? String(instruction).trim() : "";
    const hintMeta = meta && meta.targetHint ? String(meta.targetHint).trim() : "";

    if (!raw && !hintMeta)
      return { success: false, task: null, confidence: 0, error: "empty_instruction" };

    const combo = `${raw}${hintMeta ? ` ${hintMeta}` : ""}`.trim();
    const lower = combo.toLowerCase();

    const g = detectIntent(lower);
    const pr = detectPriority(lower);
    let confidence =
      typeof g.bump === "number" ? g.bump : 0.5 + Math.min(pr.conf, 0.2);

    const target = deriveTarget(lower, combo, g.intent || "query");

    /** @type {string[]} */
    const requirements = [];

    requirements.push(raw || hintMeta || `translated: ${combo.slice(0, 120)}`);

    /** split bullet-ish lines present in original raw */
    if (/\n[^\n]+\n|\n●|\n-|•/.test(raw)) {
      raw
        .split(/\r?\n/)
        .map((x) => x.replace(/^[\s\-•]+\s*/, "").trim())
        .filter(Boolean)
        .forEach((x) => {
          if (!requirements.includes(x)) requirements.push(x);
        });
    }

    /** execute: single requirement line acceptable if non-empty elsewhere */
    if (requirements.length === 1 && combo.length > 420) requirements.push(combo.slice(0, 300));

    const approvalRequiredHint = /\b(require|must have|finance|payments|migrate)\b/i.test(lower);

    const task = {
      intent: g.intent,
      target:
        g.intent === "execute"
          ? String(target || "").startsWith(`${g.intent}`)
            ? target
            : String(combo.slice(0, 420)).trim()
          : target,
      requirements,
      priority: pr.priority,
      approvalRequired: Boolean(approvalRequiredHint),
      requestedBy: meta && meta.requestedBy ? String(meta.requestedBy) : "patrick",
      sourceTranslator: true,
      originalInstruction: combo.slice(0, 1400),
    };

    confidence = Math.max(0.25, Math.min(0.99, confidence - (task.requirements.length > 12 ? 0.06 : 0)));

    return { success: true, task, confidence };
  } catch (e) {
    return {
      success: false,
      task: null,
      confidence: 0,
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  translate,
};
