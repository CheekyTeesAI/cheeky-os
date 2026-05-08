"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();
router.use(express.json({ limit: "64kb" }));

router.get("/brief", async (req, res) => {
  try {
    const refresh = String(req.query.refresh || "").toLowerCase() === "true";
    const { getOperatorBrief } = require(path.join(__dirname, "..", "services", "aiOperatorBrain.service"));
    const out = await getOperatorBrief({ refresh });
    const payload = {
      ok: true,
      mode: out.mode,
      brief: out.brief,
      timestamp: out.timestamp || new Date().toISOString(),
    };
    if (out.note) payload.note = out.note;
    if (out.cached === true) payload.cached = true;
    return res.status(200).json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      ok: true,
      mode: "fallback",
      brief: {
        headline: "AI brief unavailable",
        priorities: [],
        risks: [msg],
        recommendedActions: ["Open Owner Command Center for live summary"],
        cashFocus: [],
        productionFocus: [],
        salesFocus: [],
      },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/command", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const raw = body.command;
    if (raw === undefined || raw === null || !String(raw).trim()) {
      return res.status(400).json({
        ok: false,
        error: "command is required",
        commandType: "APPROVAL_REQUIRED",
        answer: "",
        proposedActions: [],
        requiresApproval: true,
        safeToAutoExecute: false,
      });
    }
    const command = String(raw).trim();
    if (command.length > 4000) {
      return res.status(400).json({
        ok: false,
        error: "command too long",
        commandType: "APPROVAL_REQUIRED",
        answer: "",
        proposedActions: [],
        requiresApproval: true,
        safeToAutoExecute: false,
      });
    }

    const {
      buildAIOperatorContext,
      gatherPromptEnrichment,
      runOperatorCommand,
    } = require(path.join(__dirname, "..", "services", "aiOperatorBrain.service"));

    const ctx = await buildAIOperatorContext();
    const enrichment = await gatherPromptEnrichment();
    const out = await runOperatorCommand(command, ctx, enrichment);
    return res.status(200).json({ ok: true, ...out });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      commandType: "APPROVAL_REQUIRED",
      answer: err instanceof Error ? err.message : String(err),
      proposedActions: [
        {
          label: "Operator status",
          link: "/api/operator/status",
          reason: "Verify system health",
        },
      ],
      requiresApproval: true,
      safeToAutoExecute: false,
    });
  }
});

module.exports = router;
