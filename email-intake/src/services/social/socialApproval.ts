import type { SocialPost } from "@prisma/client";
import { logger } from "../../utils/logger";

function baseUrl(): string {
  const port = String(process.env.PORT || process.env.CHEEKY_OS_PORT || "3847").trim();
  return `http://localhost:${port}`;
}

/**
 * Sends approval email listing pending posts with approve links (Resend HTTP API).
 */
export async function sendApprovalEmail(posts: SocialPost[]): Promise<void> {
  const to = String(process.env.SOCIAL_APPROVAL_EMAIL || "").trim();
  if (!to) {
    logger.warn("[socialApproval] SOCIAL_APPROVAL_EMAIL missing — skip send");
    return;
  }
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) {
    logger.warn("[socialApproval] RESEND_API_KEY missing — skip send");
    return;
  }

  const from =
    String(process.env.RESEND_FROM || "").trim() || "Cheeky OS <onboarding@resend.dev>";

  const lines: string[] = [];
  for (const p of posts) {
    const sched = p.scheduledAt ? new Date(p.scheduledAt).toISOString() : "n/a";
    lines.push(`Platform: ${p.platform}`);
    lines.push(`Caption: ${p.caption}`);
    lines.push(`Scheduled: ${sched}`);
    lines.push(`Approve link: ${baseUrl()}/api/social/approve/${p.id}`);
    lines.push("---");
  }
  const text = lines.join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Cheeky OS — Social Posts Pending Approval for This Week",
        text,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      logger.warn(`[socialApproval] Resend failed: ${res.status} ${t.slice(0, 400)}`);
      return;
    }
    logger.info("[socialApproval] approval email sent");
  } catch (e) {
    logger.warn(`[socialApproval] send error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
