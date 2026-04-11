import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

/**
 * Sends email via SMTP when configured; otherwise logs to console (dev fallback).
 * Used for invoice confirmations and scheduled follow-up reminders.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const from = (process.env.SMTP_FROM || user || "cheeky@localhost").trim();

  if (!host) {
    logger.info(
      `[EMAIL] (console fallback) to=${to} subject=${subject} body=${body.replace(/\s+/g, " ").slice(0, 200)}...`
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text: body
  });
  logger.info(`[EMAIL] sent to=${to} subject=${subject}`);
}
