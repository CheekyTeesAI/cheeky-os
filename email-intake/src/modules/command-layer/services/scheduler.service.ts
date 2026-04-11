import type { Request, Response } from "express";
import nodemailer, { type Transporter } from "nodemailer";
import { runDay } from "../controllers/operator.controller";
import { checkEvents } from "./eventEngine.service";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
let schedulerStarted = false;
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

export async function sendDailyReport(data: unknown): Promise<void> {
  const out = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const priorityDeals = Array.isArray(out.priorityDeals) ? out.priorityDeals : [];
  const actions = Array.isArray(out.actions) ? out.actions : [];
  const followups = typeof out.followups === "object" && out.followups !== null
    ? (out.followups as Record<string, unknown>)
    : {};
  const sent = typeof followups.sent === "number" ? followups.sent : 0;

  const topDealsText = priorityDeals
    .map((d) => {
      const row = typeof d === "object" && d !== null ? (d as Record<string, unknown>) : {};
      return `- ${String(row.name || "Deal")} ($${Number(row.value || 0)})`;
    })
    .join("\n");
  const actionsText = actions.map((a) => `- ${String(a)}`).join("\n");
  const body = [
    "Top Deals:",
    topDealsText || "- none",
    "",
    "Actions:",
    actionsText || "- none",
    "",
    `Follow-ups: ${sent}`
  ].join("\n");

  const transport = getSmtpTransport();
  const from = (process.env.EMAIL_USER || "").trim();
  const to = (process.env.DAILY_REPORT_EMAIL || process.env.EMAIL_USER || "").trim();
  if (!from || !to) {
    throw new Error("Missing report sender/recipient email");
  }
  await transport.sendMail({
    from,
    to,
    subject: "Cheeky Daily War Room",
    text: body
  });
}

async function runScheduledDay(): Promise<void> {
  let payload: unknown = {};
  const fakeReq = {} as Request;
  const fakeRes = {
    status: (_code: number) => fakeRes,
    json: (body: unknown) => {
      payload = body;
      return fakeRes;
    }
  } as unknown as Response;

  await runDay(fakeReq, fakeRes);
  const envelope = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const data = envelope.data;
  await sendDailyReport(data);
}

export function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(() => {
    checkEvents().catch((err) => {
      console.error("Hourly event engine error:", err);
    });
  }, HOUR_MS);

  setInterval(() => {
    runScheduledDay().catch((err) => {
      console.error("Daily scheduler error:", err);
    });
  }, DAY_MS);
}
