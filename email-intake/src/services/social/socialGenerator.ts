import type { SocialPost } from "@prisma/client";
import prisma from "../../lib/prisma";
import { logger } from "../../utils/logger";

function aiBaseUrl(): string {
  const port = String(process.env.PORT || process.env.CHEEKY_OS_PORT || "3847").trim();
  return `http://127.0.0.1:${port}`;
}

function postHour(): number {
  const h = parseInt(String(process.env.SOCIAL_POST_TIME_HOUR || "10"), 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 10;
}

function scheduleDateForIndex(dayOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset + 1);
  d.setHours(postHour(), 0, 0, 0);
  return d;
}

function extractJsonArray(text: string): unknown[] {
  const t = String(text || "").trim();
  const fence = t.match(/\[[\s\S]*\]/);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      /* fall through */
    }
  }
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Weekly batch: ask AI for 7 captions and persist as PENDING SocialPost rows.
 */
export async function generateWeeklyPosts(): Promise<SocialPost[]> {
  const out: SocialPost[] = [];
  try {
    const prompt =
      'Generate 7 social media captions for a custom apparel shop called Cheeky Tees in Fountain Inn SC. Mix of promotional, community, and behind-the-scenes content. Return JSON array of objects with fields: platform (one of: instagram, facebook, twitter, linkedin), caption, hashtags.';
    const res = await fetch(`${aiBaseUrl()}/api/ai/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; success?: boolean };
    const text = typeof data.text === "string" ? data.text : "";
    const rows = extractJsonArray(text);
    let i = 0;
    for (const row of rows) {
      if (i >= 7) break;
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const platform = String(r.platform || "instagram").toLowerCase();
      const cap = String(r.caption || "").trim();
      const tags = r.hashtags != null ? String(r.hashtags) : "";
      const caption = tags ? `${cap}\n${tags}` : cap;
      if (!caption) continue;
      const scheduledAt = scheduleDateForIndex(i);
      const created = await prisma.socialPost.create({
        data: {
          platform,
          caption,
          status: "PENDING",
          scheduledAt,
        },
      });
      out.push(created);
      i += 1;
    }
    logger.info(`[socialGenerator] created ${out.length} pending posts`);
  } catch (e) {
    logger.warn(`[socialGenerator] error: ${e instanceof Error ? e.message : String(e)}`);
  }
  return out;
}
