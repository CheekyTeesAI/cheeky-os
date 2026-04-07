/**
 * Bundle 14 — GET /automation/actions
 */

const { Router } = require("express");
const { collectAutomationActions } = require("../services/automationActionsService");

const router = Router();

router.get("/actions", async (_req, res) => {
  try {
    const data = await collectAutomationActions(10);
    return res.json(data);
  } catch (err) {
    console.error("[automation/actions]", err.message || err);
    return res.json({ actions: [] });
  }
});

module.exports = router;
