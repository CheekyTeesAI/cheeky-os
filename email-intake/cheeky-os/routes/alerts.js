/**
 * Bundle 7 — GET /alerts/today
 */

const { Router } = require("express");
const { getAlertsToday, emptyAlerts } = require("../services/alertsService");

const router = Router();

router.get("/today", async (_req, res) => {
  try {
    const data = await getAlertsToday();
    return res.json(data);
  } catch (err) {
    console.error("[alerts/today]", err.message || err);
    return res.json(emptyAlerts());
  }
});

module.exports = router;
