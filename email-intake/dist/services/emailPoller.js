"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startEmailPoller = startEmailPoller;
const logger_1 = require("../utils/logger");
const graphAuthService_1 = require("./graphAuthService");
const emailProcessor_1 = require("./emailProcessor");
let intervalHandle = null;
function pollIntervalMs() {
    const raw = String(process.env.EMAIL_POLL_INTERVAL_MS || "60000").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 5000 ? n : 60000;
}
function startEmailPoller() {
    const tenant = String(process.env.MS_TENANT_ID || "").trim();
    const client = String(process.env.MS_CLIENT_ID || "").trim();
    if (!tenant || !client) {
        logger_1.logger.warn("[emailPoller] MS_TENANT_ID or MS_CLIENT_ID missing — poller not started");
        return;
    }
    const userEmail = String(process.env.MS_USER_EMAIL || "").trim();
    if (!userEmail) {
        logger_1.logger.warn("[emailPoller] MS_USER_EMAIL missing — poller not started");
        return;
    }
    if (intervalHandle) {
        logger_1.logger.warn("[emailPoller] already running");
        return;
    }
    const tick = async () => {
        try {
            logger_1.logger.info("[emailPoller] poll cycle start");
            const token = await (0, graphAuthService_1.getGraphToken)();
            const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/mailFolders/Inbox/messages`;
            const url = `${base}?$filter=isRead%20eq%20false&$select=id,subject,body,from,receivedDateTime,isRead`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const t = await res.text();
                logger_1.logger.warn(`[emailPoller] list messages failed: ${res.status} ${t.slice(0, 400)}`);
                return;
            }
            const data = (await res.json());
            const list = Array.isArray(data.value) ? data.value : [];
            logger_1.logger.info(`[emailPoller] unread count=${list.length}`);
            for (const msg of list) {
                try {
                    await (0, emailProcessor_1.processInboundEmail)(msg);
                    const patchUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/messages/${encodeURIComponent(msg.id)}`;
                    const pr = await fetch(patchUrl, {
                        method: "PATCH",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ isRead: true }),
                    });
                    if (!pr.ok) {
                        const pt = await pr.text();
                        logger_1.logger.warn(`[emailPoller] mark read failed: ${pr.status} ${pt.slice(0, 200)}`);
                    }
                }
                catch (inner) {
                    logger_1.logger.warn(`[emailPoller] message processing error: ${inner instanceof Error ? inner.message : String(inner)}`);
                }
            }
        }
        catch (e) {
            logger_1.logger.warn(`[emailPoller] poll cycle error: ${e instanceof Error ? e.message : String(e)}`);
        }
    };
    void tick();
    intervalHandle = setInterval(() => {
        void tick();
    }, pollIntervalMs());
    logger_1.logger.info(`[emailPoller] started interval=${pollIntervalMs()}ms`);
}
