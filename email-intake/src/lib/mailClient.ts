import nodemailer from "nodemailer";

export class MailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailConfigError";
  }
}

export function isMailTransportConfigured(): boolean {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const portRaw = String(process.env.SMTP_PORT ?? "587").trim();
  const port = Number(portRaw);
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  const from = String(process.env.SMTP_FROM ?? "").trim();
  if (!host || Number.isNaN(port) || port <= 0) return false;
  if (!user || !pass) return false;
  const effectiveFrom = from || user;
  if (!effectiveFrom) return false;
  return true;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type SendEmailResult =
  | { success: true; messageId?: string }
  | { success: false; error: string };

/**
 * Sends mail via SMTP. Throws MailConfigError if SMTP env is incomplete.
 * Transport errors are returned as { success: false, error } (no throw).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isMailTransportConfigured()) {
    throw new MailConfigError(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM (SMTP_FROM may match SMTP_USER)."
    );
  }

  const host = String(process.env.SMTP_HOST ?? "").trim();
  const port = Number(String(process.env.SMTP_PORT ?? "587").trim());
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  const from = (String(process.env.SMTP_FROM ?? "").trim() || user).trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: input.to.trim(),
      subject: input.subject,
      text: input.text,
    });
    return { success: true, messageId: info.messageId };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { success: false, error: err };
  }
}
