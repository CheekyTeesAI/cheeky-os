const express = require("express");
const router = express.Router();
const { processSquarePaymentEvent } = require("../services/orderProcessor");
const { saveOrderAndTasks } = require("../services/orderPersistence");

router.post("/square/webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log("📦 Square event:", event?.type);

    const processed = await processSquarePaymentEvent(event);
    const saved = await saveOrderAndTasks(processed);

    console.log("💰 Order processed");
    console.log("🛠 Tasks:", saved.tasks.length);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.status(500).send("Error");
  }
});

module.exports = router;
