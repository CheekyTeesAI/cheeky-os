-- Social OS v1.2: single SocialPost shape; drop auxiliary social tables.

DROP TABLE IF EXISTS "PostMetrics";
DROP TABLE IF EXISTS "ContentTheme";
DROP TABLE IF EXISTS "HolidayEvent";

ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "imageUrl";
ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "platform";
ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "sourceOrderId";
ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "approvedAt";
ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "postedAt";
ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "imagePrompt";
