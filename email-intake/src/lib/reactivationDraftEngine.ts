/**
 * Reactivation Draft + Call Script Engine — review-only email + phone scripts for
 * CUSTOMER_REACTIVATION candidates. No I/O, no sends.
 *
 * Priority groups extend the core score band: MEDIUM is split into MEDIUM vs LOW
 * by score so operators get four buckets without changing followUpScoring.
 */

import type { FollowUpCandidate, FollowUpPriorityBand } from "./followUpScoring";
import { scoreFollowUpCandidate } from "./followUpScoring";

export type ReactivationDraftPriorityGroup =
  | "HIGH_PRIORITY"
  | "MEDIUM_PRIORITY"
  | "LOW_PRIORITY"
  | "REVIEW_REQUIRED";

export type ReactivationDraft = {
  priorityGroup: ReactivationDraftPriorityGroup;
  reactivationScore: number;
  band: FollowUpPriorityBand;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  subject: string;
  emailBody: string;
  callScript: string;
  tone: string;
  reason: string;
  suggestedAction: string;
  reviewRequired: boolean;
  sourceRef: string;
  sourceType: "CUSTOMER";
  draftWhy: string;
  rawContext: Record<string, unknown>;
};

/** MEDIUM band scores land in ~42–67; split for reactivation-only tiers. */
const MEDIUM_SPLIT = 54;

function firstName(name: string | null | undefined): string {
  if (!name || !String(name).trim()) return "there";
  const p = String(name).trim().split(/\s+/)[0];
  return p || "there";
}

function orderCountHint(c: FollowUpCandidate): string {
  const n = c.rawContext?.orderCount;
  return typeof n === "number" && n > 0 ? `${n} past order${n === 1 ? "" : "s"}` : "past orders with us";
}

function daysHint(c: FollowUpCandidate): string {
  const d = c.ageDays;
  if (d == null || !Number.isFinite(d)) return "a while";
  return `about ${Math.floor(d)} days`;
}

/**
 * Maps scoring output to four reactivation-specific priority labels.
 * Non-reactivation candidates should not be passed; if they are, yields REVIEW_REQUIRED.
 */
export function reactivationPriorityGroup(
  c: FollowUpCandidate
): ReactivationDraftPriorityGroup {
  if (c.type !== "CUSTOMER_REACTIVATION") {
    return "REVIEW_REQUIRED";
  }
  const { score, band } = scoreFollowUpCandidate(c);
  if (band === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  if (band === "HIGH") return "HIGH_PRIORITY";
  if (band === "MEDIUM") {
    return score >= MEDIUM_SPLIT ? "MEDIUM_PRIORITY" : "LOW_PRIORITY";
  }
  return "LOW_PRIORITY";
}

function buildCopy(
  g: ReactivationDraftPriorityGroup,
  c: FollowUpCandidate,
  greet: string
): { subject: string; emailBody: string; callScript: string; draftWhy: string; tone: string } {
  const oc = orderCountHint(c);
  const quiet = daysHint(c);

  switch (g) {
    case "HIGH_PRIORITY":
      return {
        subject: "Reconnecting — Cheeky Tees",
        emailBody: `Hi ${greet},

We’ve missed working with you. You’ve had ${oc}, and it’s been ${quiet} since your last project — we’d genuinely like to help on the next run of tees or promo items.

If you have anything coming up (even rough quantities or a date), reply with a line or two and we’ll put options together. No pressure — we’re here when you’re ready.

Best,
Cheeky Tees`,
        callScript: `Opener: “Hi, this is [your name] from Cheeky Tees — I’m calling past clients we’d love to work with again.”
Bridge: “We show it’s been ${quiet} since an order; you’ve done ${oc} with us before.”
Ask: “Anything on the calendar in the next few months — staff shirts, events, restock?”
Close: “I can email a one-pager or quote — what’s the best email to use?”`,
        draftWhy:
          "High tier: direct but warm reconnection; assumes healthy prior relationship.",
        tone: "warm, professional, direct, relationship-based",
      };

    case "MEDIUM_PRIORITY":
      return {
        subject: "Checking in — Cheeky Tees",
        emailBody: `Hi ${greet},

Quick note from Cheeky Tees — it’s been ${quiet} since we last connected. If apparel or branded gear is on your radar, we’re happy to put together a fresh quote.

Reply with what you’re thinking (even vague timing helps), or tell us to check back later.

Thanks,
Cheeky Tees`,
        callScript: `“Hey ${greet}, it’s [name] from Cheeky Tees — soft check-in, not a hard sell.”
“We’ve worked together before (${oc}); curious if anything’s coming up.”
“If not now, totally fine — want me to follow up in a few months or leave it?”`,
        draftWhy:
          "Medium tier: balanced nudge; leaves room for ‘not right now’ without sounding cold.",
        tone: "concise, friendly, professional",
      };

    case "LOW_PRIORITY":
      return {
        subject: "Here when you need us — Cheeky Tees",
        emailBody: `Hi ${greet},

Still on our side if you ever need tees or promo items again — it’s been ${quiet} since we last touched base. When something comes up, reply anytime and we’ll line up options.

Best,
Cheeky Tees`,
        callScript: `Light touch: “Quick hello from Cheeky Tees — no rush.”
“If something pops up later, you’ve got our number; happy to quote.”
Keep under ~30 seconds unless they engage.`,
        draftWhy:
          "Low tier: minimal pressure; good for cooler leads or long quiet periods.",
        tone: "light, respectful, non-desperate",
      };

    case "REVIEW_REQUIRED":
    default:
      return {
        subject: "Following up — Cheeky Tees (review)",
        emailBody: `Hi ${greet},

I’m reaching out from Cheeky Tees regarding your account. ${c.suggestedAction}

Internal context: ${c.reason}

Please verify contact details and relationship history before sending.

Thanks,
Cheeky Tees`,
        callScript: `Review first: confirm correct person and number.
Internal note: ${c.reason.slice(0, 120)}${c.reason.length > 120 ? "…" : ""}
Only call after verifying email/phone in Cheeky OS.`,
        draftWhy:
          "Score or data is weak — operator must confirm facts, tone, and fit before outreach.",
        tone: "neutral, cautious, operator-led",
      };
  }
}

/**
 * Builds one review-safe reactivation draft + call script from a reactivation candidate.
 * If `c.type` is not CUSTOMER_REACTIVATION, still returns a REVIEW_REQUIRED-shaped draft
 * so callers fail visibly rather than sending wrong copy.
 */
export function buildReactivationDraft(c: FollowUpCandidate): ReactivationDraft {
  const { score, band } = scoreFollowUpCandidate(c);
  const pg = reactivationPriorityGroup(c);
  const greet = firstName(c.customerName);

  const { subject, emailBody, callScript, draftWhy, tone } =
    c.type === "CUSTOMER_REACTIVATION"
      ? buildCopy(pg, c, greet)
      : buildCopy("REVIEW_REQUIRED", c, greet);

  const weakEmail =
    !c.customerEmail || !String(c.customerEmail).includes("@");

  const reviewRequired =
    c.reviewRequired ||
    c.type !== "CUSTOMER_REACTIVATION" ||
    pg === "REVIEW_REQUIRED" ||
    weakEmail;

  let callOut = callScript.trim();
  if (
    c.type === "CUSTOMER_REACTIVATION" &&
    (!c.customerPhone || !String(c.customerPhone).trim())
  ) {
    callOut += `

(No phone on file in Cheeky OS — lead with email; add number if you find one.)`;
  }

  let body = emailBody.trim();
  if (reviewRequired && c.type === "CUSTOMER_REACTIVATION") {
    body += `

—
Draft note: manual review before send — confirm identity, history, and tone.`;
  }

  return {
    priorityGroup: c.type === "CUSTOMER_REACTIVATION" ? pg : "REVIEW_REQUIRED",
    reactivationScore: score,
    band,
    customerName: c.customerName,
    customerEmail: c.customerEmail,
    customerPhone: c.customerPhone,
    subject,
    emailBody: body,
    callScript: callOut,
    tone,
    reason: c.reason,
    suggestedAction: c.suggestedAction,
    reviewRequired,
    sourceRef: c.sourceRef,
    sourceType: "CUSTOMER",
    draftWhy,
    rawContext: c.rawContext,
  };
}

const GROUP_ORDER: ReactivationDraftPriorityGroup[] = [
  "HIGH_PRIORITY",
  "MEDIUM_PRIORITY",
  "LOW_PRIORITY",
  "REVIEW_REQUIRED",
];

export function groupReactivationDraftsByPriority(
  drafts: ReactivationDraft[]
): Record<ReactivationDraftPriorityGroup, ReactivationDraft[]> {
  const acc = {
    HIGH_PRIORITY: [] as ReactivationDraft[],
    MEDIUM_PRIORITY: [] as ReactivationDraft[],
    LOW_PRIORITY: [] as ReactivationDraft[],
    REVIEW_REQUIRED: [] as ReactivationDraft[],
  };
  for (const d of drafts) {
    acc[d.priorityGroup].push(d);
  }
  for (const k of GROUP_ORDER) {
    acc[k].sort((a, b) => b.reactivationScore - a.reactivationScore);
  }
  return acc;
}

/** Ranked reactivation-only candidates → drafts in the same order, then group for display. */
export function buildReactivationDraftsFromCandidates(
  candidates: FollowUpCandidate[]
): ReactivationDraft[] {
  return candidates
    .filter((c) => c.type === "CUSTOMER_REACTIVATION")
    .map((c) => buildReactivationDraft(c));
}
