const express = require("express");
const router = express.Router();
const { processOrder } = require("../services/orderProcessor");

router.post("/square/webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log("📦 Square event received:", event.type);

    if (event.type === "payment.created" || event.type === "payment.updated") {
      const order = {
        id: event.data?.object?.payment?.id || "unknown",
        lineItems: [
          {
            name: "Sample Shirt Order"
          }
        ]
      };

      await processOrder(order);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.status(500).send("Error");
  }
});

module.exports = router;
