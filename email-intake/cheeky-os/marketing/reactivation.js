const { getPrisma } = require("./prisma-client");

function isDormant(lastOrderDate) {
  if (!lastOrderDate) return true;
  const ms = new Date(lastOrderDate).getTime();
  if (!Number.isFinite(ms)) return true;
  const age = Date.now() - ms;
  return age >= 60 * 24 * 60 * 60 * 1000;
}

async function listDormantCustomers() {
  const prisma = getPrisma();
  if (!prisma) return [];
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" }
  });
  return customers.filter((c) => isDormant(c.lastOrderDate));
}

async function sendReactivationEmail(name, email) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM || "Cheeky Tees <onboarding@resend.dev>").trim();
  if (!key || !email) return { ok: false, error: "missing resend key or recipient" };

  const subject = "We’ve got press time open this week 👀";
  const body =
    `Hey ${name || "there"} — we’ve got a few open production slots this week and wanted to reach out.\n\n` +
    "If you’ve got anything coming up, I can get you taken care of quickly.\n\n" +
    "Let me know 👍";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: body
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: txt.slice(0, 300) };
  }
  return { ok: true };
}

module.exports = { listDormantCustomers, sendReactivationEmail };
