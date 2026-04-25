/**
 * Cheeky Sales Agent v1 — deterministic phone intake helper.
 * Keeps flow short, one question at a time.
 */

const AGENT_PROMPT = `You are the phone sales assistant for Cheeky Tees, a custom apparel shop.

Your tone is warm, friendly, confident, local, and efficient.
You sound like a helpful small business team member, not a robotic call center.

You greet callers naturally based on time of day:
- Good morning, this is Cheeky Tees. How can I help you?
- Good afternoon, this is Cheeky Tees. How can I help you?
- Good evening, this is Cheeky Tees. How can I help you?

Your job is to:
- answer basic questions
- guide the customer
- collect the information needed for an estimate
- make simple product recommendations
- keep the order moving forward

You ask one question at a time.
You do not dump a long checklist all at once.
You keep the caller moving.

If the caller is a good fit, gather details and move toward estimate/deposit.
If the caller only wants 1 or 2 shirts, politely direct them to I Declare on Main Street in Fountain Inn.
If the caller is likely spam or unrelated, end politely and quickly.

You should not promise exact pricing unless a pricing tool is available.
Instead say that an estimate can be prepared once details are collected.`;

const REQUIRED_ORDER = [
  "project.garmentType",
  "project.quantity",
  "project.printDescription",
  "project.printLocations",
  "project.artProvided",
  "project.inkColors",
  "project.deadline",
  "customer.name",
  "customer.email",
  "customer.phone",
];

function nowGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning, this is Cheeky Tees. How can I help you?";
  if (h < 18) return "Good afternoon, this is Cheeky Tees. How can I help you?";
  return "Good evening, this is Cheeky Tees. How can I help you?";
}

function text(v) {
  return String(v == null ? "" : v).trim();
}

function lower(v) {
  return text(v).toLowerCase();
}

function getByPath(obj, p) {
  return p.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj);
}

function setByPath(obj, p, value) {
  const parts = p.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function hasAny(v) {
  if (typeof v === "number") return Number.isFinite(v) && v > 0;
  if (typeof v === "boolean") return true;
  return text(v).length > 0;
}

function createInitialState(phone) {
  return {
    source: "phone",
    customer: { name: "", email: "", phone: text(phone) },
    project: {
      garmentType: "",
      quantity: 0,
      printDescription: "",
      printLocations: "",
      inkColors: "",
      artProvided: null,
      deadline: "",
    },
    notes: "",
    fit: "unclear",
    turnCount: 0,
  };
}

function detectSpamOrUnfit(utterance) {
  const s = lower(utterance);
  const spamPhrases = [
    "google verification",
    "business listing",
    "seo",
    "rank your website",
    "press 1",
    "merchant services",
  ];
  if (spamPhrases.some((p) => s.includes(p))) {
    return { fit: "spam", reason: "Possible spam/solicitation call" };
  }
  return null;
}

function parseQuantity(utterance) {
  const m =
    utterance.match(/\b(\d+)\s*(shirts?|hoodies?|tees?|pcs|pieces)\b/i) ||
    utterance.match(/\b(\d{1,4})\b/);
  if (!m) return 0;
  return Math.max(0, parseInt(m[1], 10) || 0);
}

function maybeSetName(state, utterance) {
  const m =
    utterance.match(/\bmy name is\s+([a-z][a-z\s'-]{1,40})/i) ||
    utterance.match(/\bthis is\s+([a-z][a-z\s'-]{1,40})/i);
  if (m) state.customer.name = text(m[1]);
}

function maybeSetEmail(state, utterance) {
  const compact = utterance.replace(/\s+/g, "");
  const email = compact.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (email) state.customer.email = email[0].toLowerCase();
}

function maybeSetPhone(state, utterance) {
  const digits = utterance.replace(/\D/g, "");
  if (digits.length >= 10) {
    state.customer.phone = digits.slice(-10);
  }
}

function maybeSetGarment(state, utterance) {
  const s = lower(utterance);
  if (s.includes("hoodie")) state.project.garmentType = "hoodie";
  else if (s.includes("polo")) state.project.garmentType = "polo";
  else if (s.includes("shirt") || s.includes("tee")) state.project.garmentType = "t-shirt";
  else if (!state.project.garmentType && s.length > 3 && state.turnCount <= 2) {
    state.project.garmentType = text(utterance);
  }
}

function maybeSetPrintFields(state, utterance) {
  const s = lower(utterance);
  if (!state.project.printLocations) {
    const loc =
      utterance.match(/\b(front and back|front\s*&\s*back|front|back|left chest|sleeve)\b/i);
    if (loc) state.project.printLocations = text(loc[1]);
  }
  if (!state.project.inkColors) {
    const colors = [];
    ["white", "black", "red", "blue", "green", "gold", "yellow", "orange", "purple"].forEach((c) => {
      if (s.includes(c)) colors.push(c);
    });
    if (colors.length) state.project.inkColors = colors.join(", ");
  }
  if (!state.project.printDescription && s.length > 6) {
    state.project.printDescription = text(utterance);
  }
}

function maybeSetArtProvided(state, utterance) {
  const s = lower(utterance);
  if (s.includes("have artwork") || s.includes("have the design") || s.includes("i have art")) {
    state.project.artProvided = true;
  } else if (s.includes("need design") || s.includes("no artwork") || s.includes("don't have art")) {
    state.project.artProvided = false;
  }
}

function maybeSetDeadline(state, utterance) {
  const m = utterance.match(/\b(by|before|due)\s+([a-z0-9,\s/-]{3,40})/i);
  if (m) state.project.deadline = text(m[2]);
}

function ingestUtterance(state, utterance) {
  const u = text(utterance);
  if (!u) return state;
  state.turnCount += 1;
  maybeSetName(state, u);
  maybeSetEmail(state, u);
  maybeSetPhone(state, u);
  maybeSetGarment(state, u);
  const qty = parseQuantity(u);
  if (qty > 0) state.project.quantity = qty;
  maybeSetPrintFields(state, u);
  maybeSetArtProvided(state, u);
  maybeSetDeadline(state, u);
  return state;
}

function missingField(state) {
  for (const k of REQUIRED_ORDER) {
    if (!hasAny(getByPath(state, k))) return k;
  }
  return "";
}

function questionForField(field) {
  switch (field) {
    case "project.garmentType":
      return "What product or garment do you need?";
    case "project.quantity":
      return "How many pieces do you need?";
    case "project.printDescription":
      return "What are you printing on it?";
    case "project.printLocations":
      return "Where should the print go, like front, back, or both?";
    case "project.artProvided":
      return "Do you already have artwork or images ready?";
    case "project.inkColors":
      return "How many ink colors are you thinking?";
    case "project.deadline":
      return "When do you need these by?";
    case "customer.name":
      return "Can I get your name?";
    case "customer.email":
      return "What is the best email for your estimate?";
    case "customer.phone":
      return "What is the best callback number?";
    default:
      return "Could you share a little more so we can build your estimate?";
  }
}

function applyFitRules(state) {
  const q = Number(state.project.quantity) || 0;
  if (q > 0 && q <= 2) {
    state.fit = "small-order-redirect";
    return;
  }
  if (!state.fit || state.fit === "unclear") state.fit = "good";
}

function completePayload(state) {
  applyFitRules(state);
  return {
    source: "phone",
    customer: {
      name: text(state.customer.name),
      email: text(state.customer.email),
      phone: text(state.customer.phone),
    },
    project: {
      garmentType: text(state.project.garmentType),
      quantity: Number(state.project.quantity) || 0,
      printDescription: text(state.project.printDescription),
      printLocations: text(state.project.printLocations),
      inkColors: text(state.project.inkColors),
      artProvided: !!state.project.artProvided,
      deadline: text(state.project.deadline),
    },
    notes: text(state.notes),
    fit: state.fit || "unclear",
  };
}

function shouldFinalize(state) {
  if (state.fit === "spam" || state.fit === "small-order-redirect") return true;
  return !missingField(state);
}

function spokenRecommendation(state) {
  const gt = lower(state.project.garmentType);
  if (gt.includes("shirt") || gt.includes("tee")) {
    return "Our best-selling t-shirt option is the Gildan Softstyle. I'd be happy to include that as a starting point for your estimate.";
  }
  return "";
}

module.exports = {
  AGENT_PROMPT,
  createInitialState,
  nowGreeting,
  detectSpamOrUnfit,
  ingestUtterance,
  missingField,
  questionForField,
  shouldFinalize,
  completePayload,
  spokenRecommendation,
};
