"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSocialScheduler = startSocialScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const logger_1 = require("../../utils/logger");
const socialGenerator_1 = require("./socialGenerator");
const socialApproval_1 = require("./socialApproval");
const socialPoster_1 = require("./socialPoster");
const tz = String(process.env.SOCIAL_POST_TIME_TZ || "America/New_York").trim() || "America/New_York";
function startSocialScheduler() {
    logger_1.logger.info(`[SocialOS] scheduler registering (tz=${tz})`);
    node_cron_1.default.schedule("0 20 * * 0", async () => {
        try {
            const posts = await (0, socialGenerator_1.generateWeeklyPosts)();
            await (0, socialApproval_1.sendApprovalEmail)(posts);
            logger_1.logger.info("[SocialOS] Weekly posts generated and approval email sent");
        }
        catch (e) {
            logger_1.logger.warn(`[SocialOS] weekly job error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, { timezone: tz });
    const hour = String(process.env.SOCIAL_POST_TIME_HOUR || "10").trim();
    const cronExpr = `0 ${hour} * * *`;
    node_cron_1.default.schedule(cronExpr, async () => {
        try {
            const now = new Date();
            const due = await prisma_1.default.socialPost.findMany({
                where: {
                    status: "APPROVED",
                    scheduledAt: { lte: now },
                },
            });
            let n = 0;
            for (const p of due) {
                await (0, socialPoster_1.postToSocial)(p);
                n += 1;
            }
            logger_1.logger.info(`[SocialOS] Daily post run complete — ${n} posts processed`);
        }
        catch (e) {
            logger_1.logger.warn(`[SocialOS] daily job error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, { timezone: tz });
    if (!process.env.FB_PAGE_ID && !process.env.IG_USER_ID) {
        logger_1.logger.warn("[SocialOS] FB/IG ids missing — posting may no-op until configured");
    }
}
