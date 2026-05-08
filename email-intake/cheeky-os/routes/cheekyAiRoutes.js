"use strict";

const express = require("express");

const cheekyAiHelpbotService = require("../ai/cheekyAiHelpbotService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json({ limit: "128kb" }));

router.post("/api/cheeky-ai/ask", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const question = String(body.question || body.q || "").trim();
    const mode = body.mode ? String(body.mode).trim().toLowerCase() : "";

    const data = await cheekyAiHelpbotService.respondAsk(question, mode);
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Cheeky-AI paused safely.", technicalCode: "cheeky_ai_ask_failed", fallbackUsed: true }), {
        data: {
          answer:
            cheekyAiHelpbotService.GUARD_MSG +
            " Reload the cockpit — I cannot compose answers offline right now.",
          mode: "advisor",
          matchedEntities: [],
          recommendedActions: ["Reload cockpit", "Ping /health"],
          dashboardLinks: [],
          confidence: 0.06,
          dataWarnings: ["Helpbot assembly failed gracefully."],
          guardrailEcho: cheekyAiHelpbotService.GUARD_MSG,
        },
      })
    );
  }
});

router.get("/api/cheeky-ai/search", async (req, res) => {
  try {
    const q = req.query.q || req.query.query || "";
    const data = await cheekyAiHelpbotService.searchAcrossSystem(String(q));
    return res.json({ success: true, data });
  } catch (_e2) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Search paused safely.", technicalCode: "cheeky_ai_search_failed", fallbackUsed: true }), {
        data: { query: String(req.query.q || "").slice(0, 320), matchedEntities: [], dataWarnings: ["Search deferred."] },
      })
    );
  }
});

router.get("/api/cheeky-ai/suggestions", async (req, res) => {
  try {
    const mode = String(req.query.mode || "").trim();
    const data = cheekyAiHelpbotService.suggestionList(mode);
    return res.json({ success: true, data });
  } catch (_e3) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Suggestions unavailable safely.", technicalCode: "cheeky_ai_suggest_fail" }), {
        data: { suggestions: ["What needs Patrick approval?"], mode: "advisor", guardrailEcho: cheekyAiHelpbotService.GUARD_MSG },
      })
    );
  }
});

module.exports = router;
