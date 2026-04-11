/**
 * Natural-language → structured command (lightweight keyword + regex parser).
 * @param {string} input
 */
function parseCommand(input) {
  const raw = String(input ?? "").trim();
  const lower = raw.toLowerCase();

  let type = "EXECUTE";
  if (/\b(create|make|new|add)\b/i.test(lower)) type = "CREATE";
  else if (/\b(update|change|edit|modify)\b/i.test(lower)) type = "UPDATE";
  else if (/\b(find|show|get|list|search)\b/i.test(lower)) type = "FIND";
  else if (/\b(send|email|text|message)\b/i.test(lower)) type = "SEND";
  else if (
    /\b(analyze|analysis|what should|recommend|suggest)\b/i.test(lower)
  ) {
    type = "ANALYZE";
  } else if (/\b(do|run|execute|perform)\b/i.test(lower)) type = "EXECUTE";

  let entity = "order";
  if (/\b(task|todo|remind|reminder)\b/i.test(lower)) entity = "task";
  else if (/\b(estimate|quote|price|pricing)\b/i.test(lower)) entity = "estimate";
  else if (/\b(customer|client|contact)\b/i.test(lower)) entity = "customer";
  else if (/\b(invoice|invoices)\b/i.test(lower)) entity = "order";
  else if (/\b(order|job)\b/i.test(lower)) entity = "order";
  else if (/\b(email|mail|follow\s*up|followup)\b/i.test(lower)) entity = "email";

  const emailMatch = raw.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  const email = emailMatch ? emailMatch[0] : "";

  const phoneMatch = raw.match(
    /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/
  );
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, " ").trim() : "";

  const apparel = [
    "shirt",
    "shirts",
    "tee",
    "tees",
    "hoodie",
    "hoodies",
    "polo",
    "polos",
    "hat",
    "hats",
    "jacket",
    "jackets",
  ];
  const apparelRe = new RegExp(
    `\\b(\\d+)\\s*(${apparel.join("|")})\\b`,
    "i"
  );
  const qtyApparel = raw.match(apparelRe);
  let quantity = qtyApparel ? Number(qtyApparel[1]) : null;

  let nameGuess = "";
  const estNameQty = raw.match(
    /(?:create\s+)?(?:estimate|quote|price)\s+for\s+(.+?)\s+for\s+(\d+)/i
  );
  if (estNameQty) {
    nameGuess = estNameQty[1].trim();
    quantity = Number(estNameQty[2]);
  }

  if (quantity === null && qtyApparel) {
    quantity = Number(qtyApparel[1]);
  }
  if (quantity === null) {
    const q2 = raw.match(/\b(\d+)\s+(piece|pieces|unit|units)\b/i);
    if (q2) quantity = Number(q2[1]);
  }
  if (quantity === null) {
    const q3 = raw.match(/\b(\d+)\b/);
    if (q3 && /\b(for|×|x)\b/i.test(raw)) quantity = Number(q3[1]);
  }

  if (!nameGuess) {
    const forMatch = raw.match(/\bfor\s+(.+?)(?:\s+\d+|\s*$)/i);
    if (forMatch) {
      nameGuess = forMatch[1].replace(/\s+for\s+\d+.*$/i, "").trim();
    } else {
      const m = raw.match(
        /(?:create|make|new|send|find|update|analyze|run)\s+\w+\s+for\s+(.+)/i
      );
      if (m) nameGuess = m[1].trim();
    }
  }

  const toMatch = raw.match(
    /\bto\s+(.+?)(?:\s+offering|\s+about|\s+with\s+|$)/i
  );
  if (toMatch && (type === "SEND" || entity === "email")) {
    nameGuess = toMatch[1].trim();
  }

  const tokens = nameGuess.split(/\s+/).filter(Boolean);
  let firstName = "";
  let lastName = "";
  let company = "";
  if (tokens.length >= 3) {
    firstName = tokens[0] || "";
    lastName = tokens[1] || "";
    company = tokens.slice(2).join(" ");
  } else if (tokens.length === 2) {
    firstName = tokens[0] || "";
    lastName = tokens[1] || "";
  } else if (tokens.length === 1) {
    company = tokens[0] || "";
  }

  /** @type {Array<{ name: string, quantity: number, unitAmount: number }>} */
  let items = [];
  if (quantity !== null) {
    const itemWord = qtyApparel ? String(qtyApparel[2] || "").toLowerCase() : "";
    const label =
      itemWord && apparel.includes(itemWord) ?
        itemWord.replace(/s$/, "").replace(/ees$/, "ee")
      : "";
    items.push({
      name: label ? `${label} (custom)` : "Custom Apparel",
      quantity,
      unitAmount: 0,
    });
  }

  const subject =
    entity === "email" || type === "SEND" ?
      raw.slice(0, 120)
    : "";

  const body =
    entity === "email" || type === "SEND" ? raw : "";

  const notes = raw;

  let subjectExtra = "";
  if (entity === "task") {
    const taskTo = raw.match(/\btask\s+to\s+(.+)/i);
    if (taskTo) subjectExtra = taskTo[1].trim();
  }

  let confidence = 0.35;
  if (email) confidence += 0.2;
  if (phone) confidence += 0.15;
  if (quantity !== null) confidence += 0.15;
  if (tokens.length) confidence += 0.1;
  if (entity === "estimate" && quantity !== null) confidence += 0.1;
  confidence = Math.min(0.95, confidence);

  return {
    type,
    entity,
    intent: `${type.toLowerCase()}_${entity}`,
    data: {
      firstName,
      lastName,
      company,
      quantity,
      email,
      phone,
      items,
      subject: subjectExtra || subject,
      body,
      notes,
      name: nameGuess || null,
      tokens: raw.split(/\s+/).filter(Boolean),
    },
    confidence,
    raw,
  };
}

module.exports = { parseCommand };
