const { Router } = require("express");
const { getPrisma } = require("../marketing/prisma-client");
const { fetchSquareCustomers } = require("../marketing/square-customers");
const { listDormantCustomers, sendReactivationEmail } = require("../marketing/reactivation");

const router = Router();

router.post("/sync-customers", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ ok: false, data: null, error: "Prisma client not generated for cheeky-os/prisma" });
    }

    const customers = await fetchSquareCustomers();
    let upserted = 0;
    for (const c of customers) {
      const id = String(c.id || "").trim();
      if (!id) continue;
      const name = `${c.given_name || ""} ${c.family_name || ""}`.trim() || c.nickname || null;
      const email = c.email_address || null;
      const phone = c.phone_number || null;
      const lastOrderDate = c.updated_at ? new Date(c.updated_at) : null;
      await prisma.customer.upsert({
        where: { squareCustomerId: id },
        update: { name, email, phone, lastOrderDate },
        create: {
          squareCustomerId: id,
          name,
          email,
          phone,
          lastOrderDate
        }
      });
      upserted += 1;
    }

    return res.json({ ok: true, data: { upserted }, error: null });
  } catch (err) {
    return res.json({ ok: false, data: null, error: err.message });
  }
});

router.get("/dormant", async (_req, res) => {
  try {
    const dormant = await listDormantCustomers();
    return res.json({
      ok: true,
      data: { count: dormant.length, customers: dormant },
      error: null
    });
  } catch (err) {
    return res.json({ ok: false, data: null, error: err.message });
  }
});

router.post("/reactivate", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ ok: false, data: null, error: "Prisma client not generated for cheeky-os/prisma" });
    }

    const dormant = await listDormantCustomers();
    const results = [];
    for (const c of dormant) {
      const sent = await sendReactivationEmail(c.name, c.email);
      await prisma.campaignLog.create({
        data: {
          type: "reactivation",
          status: sent.ok ? "sent" : "failed",
          recipient: c.email || c.name || c.squareCustomerId
        }
      });
      results.push({
        customer: c.name || c.squareCustomerId,
        email: c.email || null,
        sent: !!sent.ok,
        error: sent.ok ? null : sent.error
      });
    }

    return res.json({
      ok: true,
      data: { attempted: dormant.length, results },
      error: null
    });
  } catch (err) {
    return res.json({ ok: false, data: null, error: err.message });
  }
});

module.exports = router;
