import { logger } from "../utils/logger";
import { getGraphToken } from "./graphAuthService";

export interface GraphMessage {
  id: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  body: { content: string; contentType: string };
  receivedDateTime: string;
  isRead: boolean;
}

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function voiceBaseUrl(): string {
  const port = String(process.env.PORT || process.env.CHEEKY_OS_PORT || "3000").trim();
  return `http://127.0.0.1:${port}`;
}

export async function processInboundEmail(message: GraphMessage): Promise<void> {
  const fromAddr = message.from?.emailAddress?.address || "";
  const subject = message.subject || "";
  const plain = stripHtml(message.body?.content || "");
  const text =
    subject && plain
      ? `Subject: ${subject}\n\n${plain}`
      : plain || subject || "";

  let voiceRunStatus = "unknown";
  let invoiceId: string | undefined;

  try {
    const res = await fetch(`${voiceBaseUrl()}/cheeky/voice/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source: "email",
        fromEmail: fromAddr,
        product: "T-Shirts",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    voiceRunStatus = res.ok ? "ok" : `http_${res.status}`;
    const bodyStr = JSON.stringify(data);
    const invMatch = bodyStr.match(/"invoiceId"\s*:\s*"([^"]+)"/i);
    if (invMatch) {
      invoiceId = invMatch[1];
      logger.info(`[emailProcessor] invoiceId=${invoiceId}`);
    }
    if (!res.ok) {
      logger.warn(`[emailProcessor] /cheeky/voice/run error: ${res.status} ${bodyStr.slice(0, 500)}`);
    }
  } catch (e) {
    voiceRunStatus = "fetch_error";
    logger.warn(
      `[emailProcessor] voice run failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const userEmail = String(process.env.MS_USER_EMAIL || "").trim();
  if (!userEmail) {
    logger.warn("[emailProcessor] MS_USER_EMAIL missing — skipping Graph reply");
    logger.info(
      `[emailProcessor] audit from=${fromAddr} subject=${subject} voiceRunStatus=${voiceRunStatus} invoiceId=${invoiceId || "n/a"}`
    );
    return;
  }

  try {
    const token = await getGraphToken();
    const replyUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      userEmail
    )}/messages/${encodeURIComponent(message.id)}/reply`;
    const replyBody = {
      message: {
        body: {
          contentType: "Text",
          content:
            "Thanks! We received your request and are processing your order. You will receive an invoice shortly.",
        },
      },
    };
    const r = await fetch(replyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(replyBody),
    });
    if (!r.ok) {
      const t = await r.text();
      logger.warn(`[emailProcessor] Graph reply failed: ${r.status} ${t.slice(0, 300)}`);
    }
  } catch (e) {
    logger.warn(`[emailProcessor] Graph reply error: ${e instanceof Error ? e.message : String(e)}`);
  }

  logger.info(
    `[emailProcessor] audit from=${fromAddr} subject=${subject} voiceRunStatus=${voiceRunStatus} invoiceId=${invoiceId || "n/a"}`
  );
}
