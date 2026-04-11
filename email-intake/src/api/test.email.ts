import { Request, Response, Router } from "express";
import { runIntakeFromEmailText } from "../engines/intake.engine";
import { readExpectedApiKey, readProvidedApiKey } from "../middleware/auth";
import { errorResponse } from "../utils/errors";
import { logger } from "../utils/logger";

const router = Router();

const SAMPLE_EMAIL_TEXT =
  "I need 12 shirts at $20 each for Test Company";

router.post("/cheeky/test/email", async (req: Request, res: Response) => {
  try {
    const provided = readProvidedApiKey(req);
    const expected = readExpectedApiKey();
    if (!provided || provided !== expected) {
      res.status(401).json(errorResponse("AUTH", "Invalid API key"));
      return;
    }
    const notifyTo =
      (typeof req.body?.notifyEmail === "string" && req.body.notifyEmail.trim()) ||
      (process.env.INTAKE_NOTIFY_EMAIL || "").trim() ||
      "customer@example.com";

    logger.info("[TEST EMAIL] running intake with sample text");
    const result = await runIntakeFromEmailText(SAMPLE_EMAIL_TEXT, notifyTo);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json(errorResponse("INTAKE_TEST", message));
  }
});

export default router;
