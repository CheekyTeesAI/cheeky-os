import type { Request, Response } from "express";
import nodemailer, { type Transporter } from "nodemailer";
import { getRecentEstimates } from "../services/squareEstimate.service";

type EstimateRow = {
  id: string;
  customerId: string;
  customerEmail?: string;
  email?: string;
  amount: number;
  status: string;
  createdAt: string;
};

let smtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  if (smtpTransport) return smtpTransport;
  const host = (process.env.EMAIL_HOST || "").trim();
  const port = Number(process.env.EMAIL_PORT || 587);
  const user = (process.env.EMAIL_USER || "").trim();
  const pass = (process.env.EMAIL_PASS || "").trim();

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP config missing (EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS)");
  }

  smtpTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  return smtpTransport;
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const transport = getSmtpTransport();
  const from = (process.env.EMAIL_USER || "").trim() || "no-reply@localhost";
  await transport.sendMail({
    from,
    to,
    subject,
    text: body
  });
}

function isWithinLast7Days(createdAt: string): boolean {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return now - createdMs <= sevenDaysMs;
}

function isOpenEstimate(status: string): boolean {
  const s = String(status || "").toUpperCase();
  return s !== "PAID" && s !== "ACCEPTED";
}

export async function autoFollowup(_req: Request, res: Response): Promise<Response> {
  try {
    const estimatesRes = await getRecentEstimates();
    const estimates = estimatesRes.data as EstimateRow[];
    const followups = estimates
      .filter((est) => isOpenEstimate(est.status))
      .filter((est) => isWithinLast7Days(est.createdAt))
      .map((est) => {
        const name = est.customerId || "there";
        const email =
          (typeof est.customerEmail === "string" && est.customerEmail.trim()) ||
          (typeof est.email === "string" && est.email.trim()) ||
          "";
        const amount = typeof est.amount === "number" ? est.amount : 0;
        const message =
          `Hey ${name}, just following up on your shirt order for $${amount}.\n\n` +
          "We’re locking in production this week — if you want to move forward, I just need the deposit and I’ll get everything started.\n\n" +
          "Let me know 👍";
        return { name, email, amount, message };
      });

    let sent = 0;
    let failed = 0;
    const results: Array<{ name: string; email: string; status: "sent" | "failed" }> = [];

    for (const item of followups) {
      if (!item.email) {
        failed += 1;
        results.push({ name: item.name, email: "", status: "failed" });
        continue;
      }
      try {
        await sendEmail(item.email, "Quick follow-up on your order", item.message);
        sent += 1;
        results.push({ name: item.name, email: item.email, status: "sent" });
      } catch (err) {
        failed += 1;
        console.error("autoFollowup sendEmail error:", err);
        results.push({ name: item.name, email: item.email, status: "failed" });
      }
    }

    return res.json({
      success: true,
      sent,
      failed,
      results
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate followups";
    return res.status(500).json({
      success: false,
      error: message
    });
  }
}
