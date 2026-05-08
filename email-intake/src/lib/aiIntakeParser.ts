/**
 * AI intake: structured candidate extraction + production routing suggestions.
 * Pure functions — no I/O, no order creation, no auto-quote.
 * Uncertain inputs → reviewRequired + REVIEW_REQUIRED routing.
 */

export type SuggestedProductionMethod =
  | "DTG"
  | "DTF"
  | "SCREEN_PRINT"
  | "EMBROIDERY"
  | "REVIEW_REQUIRED";

export type RoutingConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type AiIntakeParseResult = {
  source: string;
  rawText: string;
  extracted: {
    customerName: string | null;
    email: string | null;
    phone: string | null;
    items: Array<{
      garmentOrType: string | null;
      quantity: number | null;
      description: string | null;
    }>;
    totalQuantityHint: number | null;
    printLocations: string[];
    dueDate: string | null;
    notes: string | null;
  };
  routing: {
    suggestedProductionMethod: SuggestedProductionMethod;
    routingReason: string;
    confidence: RoutingConfidenceLevel;
  };
  meta: {
    parserVersion: string;
    reviewRequired: boolean;
    rawPayload: unknown;
  };
};

function asRecord(x: unknown): Record<string, unknown> | null {
  if (x == null || typeof x !== "object" || Array.isArray(x)) return null;
  return x as Record<string, unknown>;
}

function normLower(s: string): string {
  return s.trim().toLowerCase();
}

/** Best-effort email from free text (does not validate MX). */
function extractEmail(text: string): string | null {
  const m = text.match(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
  );
  return m ? m[0].trim() : null;
}

/** US-centric phone hint; returns first plausible match or null. */
function extractPhone(text: string): string | null {
  const patterns = [
    /\b\+?1?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

const LOCATION_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /\bleft chest\b/i, label: "left chest" },
  { re: /\bright chest\b/i, label: "right chest" },
  { re: /\bfull front\b/i, label: "full front" },
  { re: /\bfull back\b/i, label: "full back" },
  { re: /\bfront\b/i, label: "front" },
  { re: /\bback\b/i, label: "back" },
  { re: /\bsleeve\b/i, label: "sleeve" },
  { re: /\bneck\b/i, label: "neck" },
];

function extractPrintLocations(text: string): string[] {
  const t = normLower(text);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { re, label } of LOCATION_HINTS) {
    if (re.test(t) && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

/** Very light due hints — ISO-like or "by Friday" style left as human notes if unclear. */
function extractDueDateHint(text: string): string | null {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (slash) return slash[1];
  return null;
}

function sumItemQuantities(items: unknown): number | null {
  if (!Array.isArray(items)) return null;
  let sum = 0;
  let any = false;
  for (const row of items) {
    const r = asRecord(row);
    if (!r) continue;
    const q = r.quantity;
    if (typeof q === "number" && Number.isFinite(q) && q > 0) {
      sum += q;
      any = true;
    }
  }
  return any ? Math.round(sum) : null;
}

function itemsFromParsed(parsed: Record<string, unknown>): AiIntakeParseResult["extracted"]["items"] {
  const raw = parsed.items;
  if (!Array.isArray(raw)) return [];
  const out: AiIntakeParseResult["extracted"]["items"] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    const typ = typeof r.type === "string" ? r.type : null;
    const q =
      typeof r.quantity === "number" && Number.isFinite(r.quantity)
        ? r.quantity
        : null;
    const desc = typeof r.description === "string" ? r.description : null;
    out.push({
      garmentOrType: typ,
      quantity: q,
      description: desc,
    });
  }
  return out;
}

/**
 * Heuristic production suggestion from combined text + structured hints.
 * When ambiguous, prefers REVIEW_REQUIRED over wrong automation.
 */
export function suggestIntakeProductionRouting(input: {
  rawText: string;
  totalQuantityHint: number | null;
  itemTypeKeywords: string;
}): {
  suggestedProductionMethod: SuggestedProductionMethod;
  routingReason: string;
  confidence: RoutingConfidenceLevel;
} {
  const t = normLower(input.rawText);
  const qty = input.totalQuantityHint ?? 0;
  const kw = normLower(input.itemTypeKeywords);

  const embRe =
    /\b(embroid|embroidery|stitch|digitiz|polo|hat|caps?\b|beanie|jacket|left chest logo|patch)\b/;
  if (embRe.test(t) || embRe.test(kw)) {
    return {
      suggestedProductionMethod: "EMBROIDERY",
      routingReason:
        "Copy mentions embroidery-related garments or embellishment style",
      confidence: "MEDIUM",
    };
  }

  if (/\bscreen\s*print|silkscreen|plastisol\b/.test(t) || /\bscreen\b/.test(kw)) {
    if (qty >= 24) {
      return {
        suggestedProductionMethod: "SCREEN_PRINT",
        routingReason: "Screen print indicated with quantity at or above common minimum",
        confidence: "MEDIUM",
      };
    }
    return {
      suggestedProductionMethod: "REVIEW_REQUIRED",
      routingReason:
        "Screen print requested but quantity is below typical screen minimum — operator should confirm or fallback",
      confidence: "LOW",
    };
  }

  if (/\bdtf|direct to film|transfer\b/.test(t) || /\bdtf\b/.test(kw)) {
    return {
      suggestedProductionMethod: "DTF",
      routingReason: "DTF / transfer language detected",
      confidence: "MEDIUM",
    };
  }

  if (/\bdtg|direct to garment|full.?color photo\b/.test(t) || /\bdtg\b/.test(kw)) {
    return {
      suggestedProductionMethod: "DTG",
      routingReason: "DTG or full-color garment print language detected",
      confidence: "MEDIUM",
    };
  }

  if (/\bshirt|tee|hoodie|tank|apparel\b/.test(t) && qty > 0 && qty < 48) {
    return {
      suggestedProductionMethod: "DTG",
      routingReason: "Default for small-to-mid apparel runs when method not specified",
      confidence: "LOW",
    };
  }

  return {
    suggestedProductionMethod: "REVIEW_REQUIRED",
    routingReason:
      "Insufficient specific method signals — operator should confirm production type",
    confidence: "LOW",
  };
}

/**
 * Build full parse result from raw inbound text and optional OpenAI JSON (same shape as ai.intake).
 */
export function buildAiIntakeParseResult(input: {
  source: string;
  rawText: string;
  parsedAiJson: unknown;
}): AiIntakeParseResult {
  const rawText =
    typeof input.rawText === "string" ? input.rawText : String(input.rawText ?? "");
  const p = asRecord(input.parsedAiJson) ?? {};

  const name =
    typeof p.customerName === "string" && p.customerName.trim()
      ? p.customerName.trim()
      : null;
  let email: string | null = null;
  if (typeof p.email === "string" && p.email.includes("@")) {
    email = p.email.trim();
  } else {
    const fromText = extractEmail(rawText);
    if (fromText) email = fromText;
  }

  const phone = extractPhone(rawText);
  const notes =
    typeof p.notes === "string" ? p.notes : rawText.length ? rawText : null;

  const items = itemsFromParsed(p);
  const totalQuantityHint = sumItemQuantities(p.items);
  const printLocations = extractPrintLocations(rawText);
  const dueDate = extractDueDateHint(rawText);

  const itemKeywords = items
    .map((i) => [i.garmentOrType, i.description].filter(Boolean).join(" "))
    .join(" ");

  const routing = suggestIntakeProductionRouting({
    rawText,
    totalQuantityHint,
    itemTypeKeywords: itemKeywords,
  });

  const sparseContact = !name && !email && !phone;
  const sparseItems = items.length === 0;
  let reviewRequired =
    routing.suggestedProductionMethod === "REVIEW_REQUIRED" ||
    routing.confidence === "LOW" ||
    sparseContact ||
    sparseItems;

  let method = routing.suggestedProductionMethod;
  let routingReason = routing.routingReason;
  let routingConfidence = routing.confidence;

  if (reviewRequired && method !== "REVIEW_REQUIRED") {
    routingReason = `Operator review suggested (${method}): ${routingReason}`;
    method = "REVIEW_REQUIRED";
    routingConfidence = "LOW";
  } else if (reviewRequired) {
    routingReason = `Operator review: ${routingReason}`;
  }

  return {
    source: input.source,
    rawText,
    extracted: {
      customerName: name,
      email,
      phone,
      items,
      totalQuantityHint,
      printLocations,
      dueDate,
      notes,
    },
    routing: {
      suggestedProductionMethod: method,
      routingReason,
      confidence: routingConfidence,
    },
    meta: {
      parserVersion: "1",
      reviewRequired,
      rawPayload: input.parsedAiJson,
    },
  };
}
