"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIntent = parseIntent;
function lower(message) {
    return message.toLowerCase().trim();
}
function extractBrainDump(raw) {
    const msg = raw.trim();
    const patterns = ["sync this", "log this", "capture this", "brain dump"];
    for (const p of patterns) {
        const idx = msg.toLowerCase().indexOf(p);
        if (idx >= 0) {
            const after = msg.slice(idx + p.length).trim().replace(/^[:\-]\s*/, "");
            return after || null;
        }
    }
    return null;
}
function parseIntent(message) {
    const msg = lower(message);
    const brainDump = extractBrainDump(message);
    if (msg.includes("run the shop") ||
        msg.includes("run business") ||
        msg.includes("run the business") ||
        msg.includes("what needs attention")) {
        return { intent: "RUN_BUSINESS", confidence: 0.95 };
    }
    if (msg.includes("what should i do") ||
        msg.includes("what do i do next") ||
        msg.includes("top priorities") ||
        msg.includes("what should patrick do first") ||
        msg.includes("what should patrick do right now")) {
        return { intent: "NEXT_ACTIONS", confidence: 0.92 };
    }
    if (msg.includes("schedule today") ||
        msg.includes("build the day") ||
        msg.includes("what should we print") ||
        msg.includes("what runs first") ||
        msg.includes("schedule the day") ||
        msg.includes("what should i print first")) {
        return { intent: "SCHEDULE_DAY", confidence: 0.9 };
    }
    if (msg.includes("follow up leads") ||
        msg.includes("send follow ups") ||
        msg.includes("touch base with estimates") ||
        msg.includes("follow up stale leads")) {
        return { intent: "FOLLOW_UP_LEADS", confidence: 0.9 };
    }
    if (msg.includes("close deals")) {
        return { intent: "CLOSE_DEALS", confidence: 0.9 };
    }
    if (msg.includes("revive pipeline")) {
        return { intent: "REVIVE_PIPELINE", confidence: 0.9 };
    }
    if (msg.includes("generate revenue")) {
        return { intent: "GENERATE_REVENUE", confidence: 0.9 };
    }
    if (msg.includes("full status") ||
        msg.includes("what’s going on") ||
        msg.includes("what's going on") ||
        msg.includes("shop status")) {
        return { intent: "SHOP_STATUS", confidence: 0.88 };
    }
    if (brainDump || msg.includes("sync this") || msg.includes("log this") || msg.includes("capture this")) {
        return {
            intent: "SYNC_BRAIN",
            confidence: brainDump ? 0.93 : 0.8,
            extractedData: {
                note: brainDump || message.trim()
            }
        };
    }
    return { intent: "UNKNOWN", confidence: 0.2 };
}
