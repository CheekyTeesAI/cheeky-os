"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamsConfigError = void 0;
exports.requireTeamsWebhookUrl = requireTeamsWebhookUrl;
exports.sendTeamsWebhookMessage = sendTeamsWebhookMessage;
const logger_1 = require("../utils/logger");
class TeamsConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "TeamsConfigError";
    }
}
exports.TeamsConfigError = TeamsConfigError;
function requireTeamsWebhookUrl() {
    const url = String(process.env.TEAMS_WEBHOOK_URL ?? "").trim();
    if (!url) {
        throw new TeamsConfigError("TEAMS_WEBHOOK_URL is not set");
    }
    return url;
}
async function sendTeamsWebhookMessage(text) {
    const url = requireTeamsWebhookUrl();
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
    const body = await res.text();
    if (!res.ok) {
        logger_1.logger.warn(`Teams webhook HTTP ${res.status}: ${body.slice(0, 400)}`);
        throw new Error(`Teams webhook failed (${res.status}): ${body.slice(0, 200)}`);
    }
}
