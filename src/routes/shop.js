const express = require("express");
const router = express.Router();

const { getJobById } = require("../data/store");
const { buildShopBoardPayload } = require("../services/shopBoardService");

router.get("/board", async (req, res) => {
  try {
    const payload = await buildShopBoardPayload();
    console.log(
      "[shop/board] ready:", payload.counts.ready,
      "inProd:", payload.counts.inProduction,
      "blocked:", payload.counts.blocked,
      "completed:", payload.counts.completed,
      payload.mock ? `MOCK(${payload.reason || "no-token"})` : "LIVE",
    );
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[shop/board] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false, mock: true,
      counts: { ready: 0, inProduction: 0, blocked: 0, completed: 0 },
      columns: { ready: [], inProduction: [], blocked: [], completed: [] },
      tasksByJob: {},
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

router.get("/job/:id/tasks", (req, res) => {
  try {
    const job = getJobById(String(req.params.id || ""));
    if (!job) return res.status(200).json({ success: false, reason: "not_found" });
    const { generateTasks } = require("../services/taskEngine");
    const bundle = generateTasks(job);
    return res.status(200).json({ success: true, job, bundle });
  } catch (error) {
    return res.status(200).json({ success: false, error: error && error.message ? error.message : "unknown_error" });
  }
});

module.exports = router;
