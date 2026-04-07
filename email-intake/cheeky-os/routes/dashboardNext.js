/**
 * Bundle 2 — GET /dashboard/next-action (mounted at /dashboard).
 */

const { Router } = require("express");
const { getNextAction } = require("../services/nextAction");

const router = Router();

router.get("/next-action", async (_req, res) => {
  try {
    const payload = await getNextAction();
    return res.json(payload);
  } catch (err) {
    console.error("[dashboard/next-action]", err.message || err);
    return res.json({
      action: "No urgent sales actions — proceed to production",
      type: "production",
      target: { name: "", phone: "", id: "" },
      reason: "Error loading next action",
    });
  }
});

module.exports = router;
