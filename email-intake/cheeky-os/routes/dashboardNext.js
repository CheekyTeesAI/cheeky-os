/**
 * Bundle 2 — GET /dashboard/next-action (mounted at /dashboard).
 */

const { Router } = require("express");
const { getNextAction } = require("../services/nextAction");

const router = Router();

async function nextActionHandler(_req, res) {
  try {
    const payload = await getNextAction();
    return res.json({ success: true, ...payload });
  } catch (err) {
    console.error("[dashboard/next-action]", err.message || err);
    return res.json({
      success: false,
      action: "No urgent sales actions — proceed to production",
      type: "production",
      target: { name: "", phone: "", id: "" },
      reason: "Error loading next action",
    });
  }
}

router.get("/next-action", nextActionHandler);
router.get("/next-task", nextActionHandler);

module.exports = router;
