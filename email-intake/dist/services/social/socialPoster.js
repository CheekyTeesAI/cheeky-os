"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToSocial = postToSocial;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const logger_1 = require("../../utils/logger");
function normPlatform(p) {
    return String(p || "").toLowerCase().trim();
}
function percentEncode(s) {
    return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function oauth1Header(method, url, extra, consumerKey, consumerSecret, token, tokenSecret) {
    const oauth = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: crypto_1.default.randomBytes(16).toString("hex"),
        oauth_signature_method: "HMAC-SHA1",
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: token,
        oauth_version: "1.0",
        ...extra,
    };
    const keys = Object.keys(oauth).sort();
    const paramStr = keys.map((k) => `${percentEncode(k)}=${percentEncode(oauth[k])}`).join("&");
    const baseStr = [method.toUpperCase(), percentEncode(url), percentEncode(paramStr)].join("&");
    const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
    const sig = crypto_1.default.createHmac("sha1", signingKey).update(baseStr).digest("base64");
    const oauthWithSig = { ...oauth, oauth_signature: sig };
    const headerParams = Object.keys(oauthWithSig)
        .sort()
        .map((k) => `${percentEncode(k)}="${percentEncode(oauthWithSig[k])}"`)
        .join(", ");
    return `OAuth ${headerParams}`;
}
async function postToSocial(post) {
    const platform = normPlatform(post.platform);
    try {
        if (platform === "instagram") {
            const ig = String(process.env.IG_USER_ID || "").trim();
            const tok = String(process.env.IG_ACCESS_TOKEN || "").trim();
            if (!ig || !tok) {
                logger_1.logger.warn("[socialPoster] Instagram env missing");
                await prisma_1.default.socialPost.update({
                    where: { id: post.id },
                    data: { status: "FAILED" },
                });
                return;
            }
            const cap = post.caption;
            const img = post.imageUrl || "";
            const step1 = await axios_1.default.post(`https://graph.facebook.com/v18.0/${ig}/media`, null, {
                params: {
                    caption: cap,
                    image_url: img,
                    access_token: tok,
                },
            });
            const creationId = step1.data?.id;
            if (!creationId) {
                throw new Error("Instagram media step missing id");
            }
            await axios_1.default.post(`https://graph.facebook.com/v18.0/${ig}/media_publish`, null, {
                params: { creation_id: creationId, access_token: tok },
            });
        }
        else if (platform === "facebook") {
            const page = String(process.env.FB_PAGE_ID || "").trim();
            const tok = String(process.env.FB_ACCESS_TOKEN || "").trim();
            if (!page || !tok) {
                logger_1.logger.warn("[socialPoster] Facebook env missing");
                await prisma_1.default.socialPost.update({
                    where: { id: post.id },
                    data: { status: "FAILED" },
                });
                return;
            }
            await axios_1.default.post(`https://graph.facebook.com/v18.0/${page}/feed`, null, {
                params: { message: post.caption, access_token: tok },
            });
        }
        else if (platform === "twitter" || platform === "x") {
            const ck = String(process.env.TWITTER_API_KEY || "").trim();
            const cs = String(process.env.TWITTER_API_SECRET || "").trim();
            const atk = String(process.env.TWITTER_ACCESS_TOKEN || "").trim();
            const ats = String(process.env.TWITTER_ACCESS_SECRET || "").trim();
            if (!ck || !cs || !atk || !ats) {
                logger_1.logger.warn("[socialPoster] Twitter env missing");
                await prisma_1.default.socialPost.update({
                    where: { id: post.id },
                    data: { status: "FAILED" },
                });
                return;
            }
            const url = "https://api.twitter.com/2/tweets";
            const auth = oauth1Header("POST", url, {}, ck, cs, atk, ats);
            await axios_1.default.post(url, { text: post.caption.slice(0, 280) }, {
                headers: {
                    Authorization: auth,
                    "Content-Type": "application/json",
                },
            });
        }
        else if (platform === "linkedin") {
            const bearer = String(process.env.LINKEDIN_ACCESS_TOKEN || "").trim();
            const urn = String(process.env.LINKEDIN_PERSON_URN || "").trim();
            if (!bearer || !urn) {
                logger_1.logger.warn("[socialPoster] LinkedIn env missing");
                await prisma_1.default.socialPost.update({
                    where: { id: post.id },
                    data: { status: "FAILED" },
                });
                return;
            }
            await axios_1.default.post("https://api.linkedin.com/v2/ugcPosts", {
                author: urn,
                lifecycleState: "PUBLISHED",
                specificContent: {
                    "com.linkedin.ugc.ShareContent": {
                        shareCommentary: { text: post.caption },
                        shareMediaCategory: "NONE",
                    },
                },
                visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
            }, {
                headers: {
                    Authorization: `Bearer ${bearer}`,
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
            });
        }
        else {
            logger_1.logger.warn(`[socialPoster] unknown platform=${post.platform}`);
            await prisma_1.default.socialPost.update({
                where: { id: post.id },
                data: { status: "FAILED" },
            });
            return;
        }
        await prisma_1.default.socialPost.update({
            where: { id: post.id },
            data: { status: "POSTED", postedAt: new Date() },
        });
        logger_1.logger.info(`[socialPoster] posted id=${post.id} platform=${platform}`);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger_1.logger.warn(`[socialPoster] failed id=${post.id}: ${msg}`);
        try {
            await prisma_1.default.socialPost.update({
                where: { id: post.id },
                data: { status: "FAILED" },
            });
        }
        catch {
            /* ignore */
        }
    }
}
