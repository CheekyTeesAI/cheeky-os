import cron from "node-cron";
import prisma from "../../lib/prisma";
import { logger } from "../../utils/logger";
import { generateWeeklyPosts } from "./socialGenerator";
import { sendApprovalEmail } from "./socialApproval";
import { postToSocial } from "./socialPoster";

const tz = String(process.env.SOCIAL_POST_TIME_TZ || "America/New_York").trim() || "America/New_York";

export function startSocialScheduler(): void {
  logger.info(`[SocialOS] scheduler registering (tz=${tz})`);

  cron.schedule(
    "0 20 * * 0",
    async () => {
      try {
        const posts = await generateWeeklyPosts();
        await sendApprovalEmail(posts);
        logger.info("[SocialOS] Weekly posts generated and approval email sent");
      } catch (e) {
        logger.warn(`[SocialOS] weekly job error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    { timezone: tz }
  );

  const hour = String(process.env.SOCIAL_POST_TIME_HOUR || "10").trim();
  const cronExpr = `0 ${hour} * * *`;
  cron.schedule(
    cronExpr,
    async () => {
      try {
        const now = new Date();
        const due = await prisma.socialPost.findMany({
          where: {
            status: "APPROVED",
            scheduledAt: { lte: now },
          },
        });
        let n = 0;
        for (const p of due) {
          await postToSocial(p);
          n += 1;
        }
        logger.info(`[SocialOS] Daily post run complete — ${n} posts processed`);
      } catch (e) {
        logger.warn(`[SocialOS] daily job error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    { timezone: tz }
  );

  if (!process.env.FB_PAGE_ID && !process.env.IG_USER_ID) {
    logger.warn("[SocialOS] FB/IG ids missing — posting may no-op until configured");
  }
}
