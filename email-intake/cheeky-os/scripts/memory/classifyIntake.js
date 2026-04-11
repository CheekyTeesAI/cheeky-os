function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join("-");
}

function nameCandidate(rawText) {
  const known = rawText.match(/\b(Bullseye|Carolina Made|SanMar|S&S|AlphaBroder)\b/i);
  if (known) return known[1];
  const pairs = [];
  const words = String(rawText).split(/\s+/);
  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i].replace(/[^A-Za-z]/g, "");
    const b = words[i + 1].replace(/[^A-Za-z]/g, "");
    if (/^[A-Z][a-z]+$/.test(a) && /^[A-Z][a-z]+$/.test(b)) {
      pairs.push(`${a} ${b}`);
    }
  }
  return pairs[0] || null;
}

function classifyIntake(rawText) {
  const text = String(rawText || "");
  const lower = text.toLowerCase();
  const signals = [];

  const hasQuantity = /\b\d+\b/.test(lower);
  const hasDue = /tomorrow|next week|due|deadline/.test(lower);
  const hasGarments = /shirt|hoodie|garment|sizes|print|mockup|art approval|production/.test(lower);

  const orderSignals = [
    hasQuantity && /shirt|hoodie|garment/.test(lower),
    /sizes|garments/.test(lower),
    hasDue && /production|print|mockup|order/.test(lower),
    /order\s*#|order\b/.test(lower) && hasGarments
  ].filter(Boolean).length;

  const customerSignals = [
    /quote|invoice|deposit|reorder|follow up|approve art/.test(lower),
    /shirt|hoodie/.test(lower) && /quote|reorder/.test(lower),
    /follow up/.test(lower) && /deposit|invoice/.test(lower)
  ].filter(Boolean).length;

  const vendorSignals = [
    /bullseye|carolina made|s&s|sanmar|alphabroder/.test(lower),
    /supplier|vendor/.test(lower) && /invoice|pickup|order ready/.test(lower),
    /pickup|subcontract|blank order/.test(lower)
  ].filter(Boolean).length;

  const taskSignals = [
    /i need to/.test(lower),
    /follow up|call|send|waiting on/.test(lower),
    /by tomorrow|next week/.test(lower)
  ].filter(Boolean).length;

  let category = "general";
  let confidence = "low";

  // Priority order: order -> customer -> vendor -> task -> general
  if (orderSignals >= 1) {
    category = "order";
    confidence = orderSignals >= 2 ? "high" : "medium";
    signals.push("order");
    if (hasQuantity) signals.push("quantity");
    if (hasGarments) signals.push("garments/print");
    if (hasDue) signals.push("due/production");
  } else if (customerSignals >= 1) {
    category = "customer";
    confidence = customerSignals >= 2 ? "high" : "medium";
    signals.push("customer");
    if (/quote/.test(lower)) signals.push("quote");
    if (/deposit/.test(lower)) signals.push("deposit");
    if (/invoice/.test(lower)) signals.push("invoice");
    if (/follow up/.test(lower)) signals.push("follow up");
  } else if (vendorSignals >= 1) {
    category = "vendor";
    confidence = vendorSignals >= 2 ? "high" : "medium";
    signals.push("vendor");
    if (/pickup/.test(lower)) signals.push("pickup");
    if (/invoice/.test(lower)) signals.push("vendor invoice");
  } else if (taskSignals >= 1) {
    category = "task";
    confidence = taskSignals >= 2 ? "high" : "medium";
    signals.push("task");
  }

  const name = nameCandidate(text);
  const strongEntityCandidate = Boolean(name && (orderSignals >= 2 || customerSignals >= 2 || vendorSignals >= 2));

  const suggestedEntityType =
    category === "customer"
      ? "customer"
      : category === "vendor"
        ? "vendor"
        : category === "order"
          ? "order"
          : null;

  const suggestedEntityId = strongEntityCandidate && name ? slugify(name) : null;

  const summary =
    category === "order"
      ? "Order intake with production/garment details."
      : category === "customer"
        ? "Customer intake regarding quote/invoice/follow-up."
        : category === "vendor"
          ? "Vendor intake regarding supplier status/blockers."
          : category === "task"
            ? "Task-oriented intake requiring follow-through."
            : "General intake logged for review.";

  return {
    category,
    confidence,
    signals,
    strongEntityCandidate,
    suggestedEntityType,
    suggestedEntityId,
    summary
  };
}

module.exports = classifyIntake;
