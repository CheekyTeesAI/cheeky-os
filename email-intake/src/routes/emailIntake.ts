import { Router, Request, Response } from "express";
import { parseEmailIntake } from "../services/emailIntakeParser";
import { executeEmailIntakePipeline } from "../services/emailIntakeOrderService";
import { logger } from "../utils/logger";

const router = Router();

router.post("/api/intake/email", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const fromEmail =
      typeof body.fromEmail === "string" ? body.fromEmail.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body.trim() : "";
    const fromName =
      typeof body.fromName === "string" ? body.fromName.trim() : "";

    if (!fromEmail || !subject || !bodyText) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: fromEmail, subject, body",
      });
      return;
    }

    const parsed = parseEmailIntake({
      fromName,
      fromEmail,
      subject,
      body: bodyText,
    });

    const pipeline = await executeEmailIntakePipeline(parsed);

    if (!pipeline.teamsIntake.success) {
      logger.warn(
        `Teams notifyNewIntake failed for ${pipeline.order.id}: ${pipeline.teamsIntake.error}`
      );
    }
    if (pipeline.teamsBlocked && !pipeline.teamsBlocked.success) {
      logger.warn(
        `Teams notifyBlockedOrder failed for ${pipeline.order.id}: ${pipeline.teamsBlocked.error}`
      );
    }

    res.json({
      success: true,
      parsed: pipeline.parsed,
      order: pipeline.order,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process email intake";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
