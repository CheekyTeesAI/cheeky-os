import { Request, Response, Router } from "express";
import { brain } from "../core/brain";
import { gatekeeper } from "../core/gatekeeper";
import { route } from "../core/router";
import { getLastRun, setLastRun } from "../debug/store";
import { readExpectedApiKey, readProvidedApiKey } from "../middleware/auth";
import { stepLog } from "../utils/logger";

const router = Router();

/**
 * Re-runs the last stored `input` through the manual voice pipeline (brain → gatekeeper → router → sales).
 * Does not re-send intake confirmation email.
 */
router.post("/cheeky/debug/replay", async (req: Request, res: Response) => {
  const provided = readProvidedApiKey(req);
  const expected = readExpectedApiKey();
  if (!provided || provided !== expected) {
    res.status(401).json({
      ok: false,
      success: false,
      stage: "auth",
      error: "Invalid API key"
    });
    return;
  }

  const prev = getLastRun();
  if (!prev) {
    res.status(400).json({ ok: false, error: "No last run to replay" });
    return;
  }

  const text = prev.input;

  try {
    const brainOut = await brain(text);
    stepLog.brain(`replay intent=${brainOut.intent} confidence=${brainOut.confidence}`);

    const gk = gatekeeper(brainOut);
    if (gk.ok === false) {
      stepLog.gatekeeper(`replay blocked: ${gk.error}`);
      const output = {
        ok: false,
        success: false,
        stage: gk.stage,
        error: gk.error
      };
      setLastRun({ input: text, output, timestamp: Date.now() });
      res.status(400).json(output);
      return;
    }

    stepLog.gatekeeper("replay passed");
    stepLog.router("replay dispatch CREATE_INVOICE");

    const routed = await route(brainOut.intent, gk.payload);
    stepLog.engine(`replay invoiceId=${routed.invoiceId} status=${routed.status}`);

    const output = { ...routed, confidence: brainOut.confidence };
    setLastRun({ input: text, output, timestamp: Date.now() });
    res.json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const output = { ok: false, stage: "PIPELINE", error: message };
    setLastRun({ input: text, output, timestamp: Date.now() });
    res.status(500).json(output);
  }
});

export default router;
