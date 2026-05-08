"use strict";
/**
 * Operator-approved outbound send queue — file-backed only (no Prisma, no auto-send).
 * Queue file: outputs/send-queue/queue.json under email-intake root.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueFilePath = queueFilePath;
exports.loadQueue = loadQueue;
exports.saveQueue = saveQueue;
exports.enqueueFromOutreachDraft = enqueueFromOutreachDraft;
exports.approveEntry = approveEntry;
exports.blockEntry = blockEntry;
exports.queueForSend = queueForSend;
exports.markSent = markSent;
exports.recordSendOutcome = recordSendOutcome;
exports.getEntryById = getEntryById;
exports.retryFailedToQueued = retryFailedToQueued;
exports.listEntries = listEntries;
exports.listSendableEntries = listSendableEntries;
exports.reopenDraftReview = reopenDraftReview;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
function queueDir(baseDir) {
    return path.join(baseDir, "outputs", "send-queue");
}
function queueFilePath(baseDir) {
    return path.join(queueDir(baseDir), "queue.json");
}
function isoNow() {
    return new Date().toISOString();
}
function atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    const payload = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmp, payload, "utf8");
    fs.renameSync(tmp, filePath);
}
function loadQueue(baseDir) {
    const p = queueFilePath(baseDir);
    if (!fs.existsSync(p)) {
        return { version: 1, entries: [] };
    }
    try {
        const raw = fs.readFileSync(p, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
            return { version: 1, entries: [] };
        }
        return parsed;
    }
    catch {
        return { version: 1, entries: [] };
    }
}
function saveQueue(baseDir, q) {
    atomicWriteJson(queueFilePath(baseDir), q);
}
function nextId() {
    return `sq_${(0, crypto_1.randomUUID)()}`;
}
function enqueueFromOutreachDraft(baseDir, draft, opts) {
    const q = loadQueue(baseDir);
    const now = isoNow();
    /** Default: always DRAFT_REVIEW so nothing is “ready to send” without explicit approve + queue. */
    const initial = opts?.initialState ?? "DRAFT_REVIEW";
    const entry = {
        id: nextId(),
        type: draft.followUpType,
        priorityScore: draft.priorityScore,
        customerName: draft.customerName,
        customerEmail: draft.customerEmail,
        customerPhone: draft.customerPhone,
        subject: draft.subject,
        body: draft.body,
        tone: draft.tone,
        state: initial,
        approvedBy: null,
        approvedAt: null,
        reviewRequired: draft.reviewRequired,
        blockedReason: null,
        sourceRef: draft.sourceRef,
        sourceType: draft.sourceType,
        reason: draft.reason,
        suggestedAction: draft.suggestedAction,
        createdAt: now,
        updatedAt: now,
        rawContext: { ...draft.rawContext, draftWhy: draft.draftWhy },
    };
    q.entries.unshift(entry);
    saveQueue(baseDir, q);
    return entry;
}
const ALLOWED = {
    DRAFT_REVIEW: ["APPROVED", "BLOCKED"],
    APPROVED: ["QUEUED", "BLOCKED", "DRAFT_REVIEW"],
    QUEUED: ["SENT", "FAILED", "BLOCKED", "APPROVED"],
    BLOCKED: ["DRAFT_REVIEW", "APPROVED"],
    SENT: [],
    FAILED: ["QUEUED", "BLOCKED", "DRAFT_REVIEW"],
};
function assertTransition(from, to) {
    const ok = ALLOWED[from]?.includes(to);
    if (!ok) {
        throw new Error(`Invalid transition ${from} -> ${to}`);
    }
}
function approveEntry(baseDir, id, approvedBy) {
    const q = loadQueue(baseDir);
    const i = q.entries.findIndex((e) => e.id === id);
    if (i < 0)
        throw new Error(`Entry not found: ${id}`);
    const e = q.entries[i];
    assertTransition(e.state, "APPROVED");
    const now = isoNow();
    e.state = "APPROVED";
    e.approvedBy = approvedBy.trim() || "operator";
    e.approvedAt = now;
    e.updatedAt = now;
    e.blockedReason = null;
    saveQueue(baseDir, q);
    return e;
}
function blockEntry(baseDir, id, reason) {
    const q = loadQueue(baseDir);
    const i = q.entries.findIndex((e) => e.id === id);
    if (i < 0)
        throw new Error(`Entry not found: ${id}`);
    const e = q.entries[i];
    if (e.state === "SENT")
        throw new Error("Cannot block SENT entry");
    assertTransition(e.state, "BLOCKED");
    const now = isoNow();
    e.state = "BLOCKED";
    e.blockedReason = reason.trim() || "(blocked)";
    e.updatedAt = now;
    saveQueue(baseDir, q);
    return e;
}
function queueForSend(baseDir, id, opts) {
    const q = loadQueue(baseDir);
    const i = q.entries.findIndex((e) => e.id === id);
    if (i < 0)
        throw new Error(`Entry not found: ${id}`);
    const e = q.entries[i];
    if (e.reviewRequired && !opts?.force) {
        throw new Error("Entry requires human review — use queue --force after verifying copy and facts");
    }
    assertTransition(e.state, "QUEUED");
    const now = isoNow();
    e.state = "QUEUED";
    e.updatedAt = now;
    saveQueue(baseDir, q);
    return e;
}
/** Label-only: marks as sent in queue file; does not call email APIs. */
function markSent(baseDir, id) {
    const q = loadQueue(baseDir);
    const i = q.entries.findIndex((e) => e.id === id);
    if (i < 0)
        throw new Error(`Entry not found: ${id}`);
    const e = q.entries[i];
    assertTransition(e.state, "SENT");
    const now = isoNow();
    e.state = "SENT";
    e.updatedAt = now;
    e.sendAttemptedAt = e.sendAttemptedAt ?? now;
    e.sendResult = e.sendResult ?? "marked_sent_manual";
    saveQueue(baseDir, q);
    return e;
}
/**
 * After a real send attempt: QUEUED → SENT or FAILED (never silent).
 */
function recordSendOutcome(baseDir, id, outcome, opts) {
    const q = loadQueue(baseDir);
    const i = q.entries.findIndex((e) => e.id === id);
    if (i < 0)
        throw new Error(`Entry not found: ${id}`);
    const e = q.entries[i];
    if (e.state !== "QUEUED") {
        throw new Error(`recordSendOutcome requires QUEUED (currently ${e.state})`);
    }
    const now = isoNow();
    e.sendAttemptedAt = now;
    e.updatedAt = now;
    if (outcome === "SENT") {
        assertTransition(e.state, "SENT");
        e.state = "SENT";
        e.sendResult = "sent";
        e.sendError = null;
    }
    else {
        assertTransition(e.state, "FAILED");
        e.state = "FAILED";
        e.sendResult = "failed";
        e.sendError = (opts?.errorMessage ?? "send failed").slice(0, 2000);
    }
    saveQueue(baseDir, q);
    return e;
}
function getEntryById(baseDir, id) {
    const q = loadQueue(baseDir);
    return q.entries.find((e) => e.id === id) ?? null;
}
/** FAILED → QUEUED for operator retry (clears last error). */
function retryFailedToQueued(baseDir, id) {
    const q = loadQueue(baseDir);
    const i = q.entries.findIndex((e) => e.id === id);
    if (i < 0)
        throw new Error(`Entry not found: ${id}`);
    const e = q.entries[i];
    if (e.state !== "FAILED") {
        throw new Error(`retry expects FAILED (currently ${e.state})`);
    }
    assertTransition(e.state, "QUEUED");
    const now = isoNow();
    e.state = "QUEUED";
    e.sendError = null;
    e.sendResult = null;
    e.sendAttemptedAt = null;
    e.updatedAt = now;
    saveQueue(baseDir, q);
    return e;
}
function listEntries(baseDir, filter) {
    const q = loadQueue(baseDir);
    if (!filter?.state)
        return [...q.entries];
    return q.entries.filter((e) => e.state === filter.state);
}
/** QUEUED rows only, oldest first (bounded send order). */
function listSendableEntries(baseDir) {
    const rows = listEntries(baseDir, { state: "QUEUED" });
    return [...rows].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
}
function reopenDraftReview(baseDir, id) {
    const q = loadQueue(baseDir);
    const i = q.entries.findIndex((e) => e.id === id);
    if (i < 0)
        throw new Error(`Entry not found: ${id}`);
    const e = q.entries[i];
    if (e.state === "FAILED") {
        throw new Error("FAILED entries: use retry-failed or block");
    }
    if (e.state !== "BLOCKED") {
        throw new Error("reopen only applies to BLOCKED entries");
    }
    assertTransition(e.state, "DRAFT_REVIEW");
    const now = isoNow();
    e.state = "DRAFT_REVIEW";
    e.blockedReason = null;
    e.updatedAt = now;
    saveQueue(baseDir, q);
    return e;
}
