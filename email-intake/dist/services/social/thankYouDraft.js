"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateThankYouDraft = generateThankYouDraft;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const logger_1 = require("../../utils/logger");
function aiBaseUrl() {
    const port = String(process.env.PORT || process.env.CHEEKY_OS_PORT || "3847").trim();
    return `http://127.0.0.1:${port}`;
}
async function generateThankYouDraft(orderId, customerName, items) {
    const prompt = `Write a warm thank-you social media post for Cheeky Tees custom apparel shop. Customer: ${customerName}. Items ordered: ${items.join(", ")}. Keep it under 280 characters. Do not include the customer's last name.`;
    let caption = "Thanks for choosing Cheeky Tees!";
    try {
        const res = await fetch(`${aiBaseUrl()}/api/ai/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
        });
        const data = (await res.json().catch(() => ({})));
        if (typeof data.text === "string" && data.text.trim()) {
            caption = data.text.trim().slice(0, 280);
        }
    }
    catch (e) {
        logger_1.logger.warn(`[thankYouDraft] AI error: ${e instanceof Error ? e.message : String(e)}`);
    }
    const created = await prisma_1.default.socialPost.create({
        data: {
            platform: "instagram",
            caption,
            status: "PENDING",
            orderId,
            scheduledAt: null,
        },
    });
    logger_1.logger.info(`[thankYouDraft] created social post id=${created.id} orderId=${orderId}`);
    return created;
}
