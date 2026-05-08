/**
 * Deterministic keyword-first classification of inbound customer email.
 * Optional OpenAI fallback only when explicitly enabled (narrow use).
 */

export type ReplyClassification =
  | "PROOF_APPROVED"
  | "PROOF_REJECTED"
  | "REVISION_REQUEST"
  | "GENERAL_REPLY"
  | "DEPOSIT_RESPONSE"
  | "PICKUP_RESPONSE"
  | "UNKNOWN";

export type ClassifyInput = {
  subject: string;
  body: string;
  fromEmail: string;
  orderContext?: string | null;
};

const APPROVE = /\b(approved?|approve|looks good|go ahead|perfect|yes\s*[,!.]|ok to print|proceed|send it|green light)\b/i;
const REJECT = /\b(not approved|don't print|do not print|hold off|stop|reject|cancel (the )?proof|no proof)\b/i;
const REVISE = /\b(change|revise|revision|move|fix|adjust|wrong|update|redo|tweak|can you make)\b/i;
const DEPOSIT = /\b(deposit|paid|payment sent|zelle|venmo|card|invoice)\b/i;
const PICKUP = /\b(pickup|pick up|collect|on my way|be there|grab (my )?order)\b/i;

export function classifyCustomerReply(input: ClassifyInput): ReplyClassification {
  const text = `${input.subject}\n${input.body}`.trim();
  const low = text.toLowerCase();

  if (REJECT.test(text) && !APPROVE.test(text)) {
    return "PROOF_REJECTED";
  }
  if (REVISE.test(text)) {
    return "REVISION_REQUEST";
  }
  if (APPROVE.test(text) && !REJECT.test(text)) {
    return "PROOF_APPROVED";
  }
  if (DEPOSIT.test(low) && (low.includes("paid") || low.includes("sent"))) {
    return "DEPOSIT_RESPONSE";
  }
  if (PICKUP.test(low)) {
    return "PICKUP_RESPONSE";
  }
  if (text.length < 400 && !REVISE.test(text)) {
    return "GENERAL_REPLY";
  }

  return "UNKNOWN";
}

/** Heuristic: branch to reply handling without blocking new-order intake. */
export function isLikelyCustomerReplyEmail(subject: string, body: string): boolean {
  const s = String(subject || "").trim();
  const t = String(body || "").trim();
  if (/^re:\s*/i.test(s)) return true;
  if (/\b(fwd:|fw:)\s*/i.test(s) && /\bproof|mockup|order|deposit\b/i.test(s + t)) return true;
  const newLead =
    /\b(quote|estimate|how much|price for|new order|place an order|looking for|need shirts)\b/i.test(
      t
    ) && t.length > 80;
  if (newLead && !/^re:\s*/i.test(s)) return false;
  if (/\b(proof|mockup|approval|approve the|deposit reminder)\b/i.test(s + t) && t.length < 3000) {
    return true;
  }
  return false;
}
