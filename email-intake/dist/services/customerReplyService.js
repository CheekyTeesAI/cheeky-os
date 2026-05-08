"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIDENCE = exports.INBOUND_TYPES = void 0;
exports.matchReplyToOrder = matchReplyToOrder;
exports.processInboundCustomerReply = processInboundCustomerReply;
exports.listRecentInboundReplies = listRecentInboundReplies;
exports.listRepliesForDashboard = listRepliesForDashboard;
const path_1 = __importDefault(require("path"));
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
const customerReplyClassifier_1 = require("../lib/customerReplyClassifier");
const proofRoutingService_1 = require("./proofRoutingService");
const productionPrintGateService_1 = require("./productionPrintGateService");
exports.INBOUND_TYPES = {
    CUSTOMER_REPLY: "CUSTOMER_REPLY",
    CUSTOMER_APPROVED: "CUSTOMER_APPROVED",
    CUSTOMER_REJECTED: "CUSTOMER_REJECTED",
    CUSTOMER_REVISION_REQUEST: "CUSTOMER_REVISION_REQUEST",
};
exports.CONFIDENCE = {
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
    NONE: "NONE",
};
function normEmail(e) {
    return String(e || "")
        .trim()
        .toLowerCase();
}
function excerpt(s, max = 500) {
    const t = s.trim();
    return t.length <= max ? t : `${t.slice(0, max)}…`;
}
/**
 * 1) Explicit order # / id in subject+body
 * 2) Customer email → most recently updated open order(s)
 * 3) Recent outbound comm to same email → thread orderId
 * 4) Fallback: latest order for email
 */
async function matchReplyToOrder(input) {
    const blob = `${input.subject}\n${input.body}`;
    const uuid = blob.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuid) {
        const o = await client_1.db.order.findFirst({
            where: { id: uuid[0], deletedAt: null },
        });
        if (o)
            return { order: o, confidence: exports.CONFIDENCE.HIGH };
    }
    const chk = blob.match(/\bCHK-\d+\b/i);
    if (chk) {
        const o = await client_1.db.order.findFirst({
            where: { orderNumber: chk[0], deletedAt: null },
        });
        if (o)
            return { order: o, confidence: exports.CONFIDENCE.HIGH };
    }
    const onum = blob.match(/\border\s*#?\s*([A-Z0-9CHK.-]+)/i);
    if (onum && onum[1]) {
        const token = onum[1].trim();
        const o = await client_1.db.order.findFirst({
            where: {
                deletedAt: null,
                OR: [{ orderNumber: token }, { id: token }],
            },
        });
        if (o)
            return { order: o, confidence: exports.CONFIDENCE.HIGH };
    }
    const em = normEmail(input.fromEmail);
    if (!em)
        return { order: null, confidence: exports.CONFIDENCE.NONE };
    const thread = await client_1.db.customerCommunication.findFirst({
        where: {
            OR: [
                { customerEmail: { equals: em, mode: "insensitive" } },
                { customerEmail: em },
            ],
            type: {
                in: [
                    "DEPOSIT_REMINDER",
                    "PROOF_REQUEST",
                    "STATUS_UPDATE",
                    "PICKUP_READY",
                ],
            },
            orderId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { orderId: true },
    });
    if (thread?.orderId) {
        const o = await client_1.db.order.findFirst({
            where: { id: thread.orderId, deletedAt: null },
        });
        if (o)
            return { order: o, confidence: exports.CONFIDENCE.MEDIUM };
    }
    const sameEmail = await client_1.db.order.findMany({
        where: {
            deletedAt: null,
            email: { equals: em, mode: "insensitive" },
            status: { not: "CANCELLED" },
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
    });
    if (sameEmail.length === 1) {
        return { order: sameEmail[0], confidence: exports.CONFIDENCE.MEDIUM };
    }
    if (sameEmail.length > 1) {
        return { order: sameEmail[0], confidence: exports.CONFIDENCE.LOW };
    }
    const byCustomer = await client_1.db.order.findMany({
        where: {
            deletedAt: null,
            status: { not: "CANCELLED" },
            customer: { email: { equals: em, mode: "insensitive" } },
        },
        orderBy: { updatedAt: "desc" },
        take: 2,
        include: { customer: true },
    });
    if (byCustomer.length === 1) {
        return { order: byCustomer[0], confidence: exports.CONFIDENCE.MEDIUM };
    }
    if (byCustomer.length > 1) {
        return { order: byCustomer[0], confidence: exports.CONFIDENCE.LOW };
    }
    return { order: null, confidence: exports.CONFIDENCE.NONE };
}
function memLog(type, data) {
    try {
        // Runtime: dist/services → ../../src/services/memoryService.js
        const ms = require(path_1.default.join(__dirname, "..", "..", "src", "services", "memoryService.js"));
        if (typeof ms.logEvent === "function")
            ms.logEvent(type, data);
    }
    catch {
        /* optional */
    }
}
async function logCommRow(data) {
    const row = await client_1.db.customerCommunication.create({
        data: {
            orderId: data.orderId ?? null,
            customerName: data.customerName ?? null,
            customerEmail: data.customerEmail ?? null,
            type: data.type,
            subject: data.subject,
            message: data.message,
            status: data.status,
            classification: data.classification ?? null,
            needsReview: data.needsReview ?? false,
            matchConfidence: data.matchConfidence ?? null,
        },
    });
    return { id: row.id };
}
async function ensureRevisionTask(orderId) {
    const order = await client_1.db.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { tasks: { select: { type: true } } },
    });
    if (!order)
        return;
    if (order.tasks.some((t) => t.type === "REVISION_REQUEST"))
        return;
    const job = await client_1.db.job.findUnique({ where: { orderId } });
    if (!job)
        return;
    const label = order.orderNumber ?? orderId.slice(0, 8);
    await client_1.db.task.create({
        data: {
            orderId,
            jobId: job.id,
            title: `Customer requested proof revision for Order #${label}`,
            type: "REVISION_REQUEST",
            status: "PENDING",
        },
    });
}
function canAutoAct(confidence, classification) {
    if (confidence !== exports.CONFIDENCE.HIGH)
        return false;
    return (classification === "PROOF_APPROVED" || classification === "PROOF_REJECTED");
}
function canAutoRevision(confidence) {
    return confidence === exports.CONFIDENCE.HIGH || confidence === exports.CONFIDENCE.MEDIUM;
}
/**
 * Inbound pipeline: classify → match → log → optional order updates (safe gates).
 */
async function processInboundCustomerReply(input) {
    const classification = (0, customerReplyClassifier_1.classifyCustomerReply)({
        subject: input.subject,
        body: input.body,
        fromEmail: input.fromEmail,
    });
    const { order, confidence } = await matchReplyToOrder({
        subject: input.subject,
        body: input.body,
        fromEmail: input.fromEmail,
    });
    const baseSubject = input.subject || "(no subject)";
    const bodyExcerpt = excerpt(input.body);
    const actions = [];
    const logMeta = {
        customerName: input.customerName ?? null,
        customerEmail: normEmail(input.fromEmail) || null,
        subject: baseSubject,
        message: bodyExcerpt,
        status: "RECEIVED",
        classification,
        matchConfidence: confidence,
    };
    if (!order) {
        await logCommRow({
            ...logMeta,
            orderId: null,
            type: exports.INBOUND_TYPES.CUSTOMER_REPLY,
            needsReview: true,
        });
        memLog("unmatched_customer_reply", {
            classification,
            from: input.fromEmail,
            matchConfidence: confidence,
        });
        logger_1.logger.info(`[customerReply] unmatched classification=${classification} from=${input.fromEmail}`);
        return {
            handled: true,
            path: "customer_reply",
            classification,
            orderId: null,
            matchConfidence: confidence,
            needsReview: true,
            actions: ["logged_unmatched"],
        };
    }
    const blockProofAuto = classification === "PROOF_APPROVED" || classification === "PROOF_REJECTED"
        ? !canAutoAct(confidence, classification)
        : false;
    const needsReview = confidence === exports.CONFIDENCE.LOW ||
        classification === "UNKNOWN" ||
        blockProofAuto;
    await logCommRow({
        ...logMeta,
        orderId: order.id,
        type: exports.INBOUND_TYPES.CUSTOMER_REPLY,
        needsReview,
    });
    memLog("customer_reply_received", {
        orderId: order.id,
        classification,
        matchConfidence: confidence,
    });
    actions.push("logged_reply");
    if (needsReview) {
        return {
            handled: true,
            path: "customer_reply",
            classification,
            orderId: order.id,
            matchConfidence: confidence,
            needsReview: true,
            actions,
        };
    }
    if (classification === "PROOF_APPROVED" && canAutoAct(confidence, classification)) {
        await (0, proofRoutingService_1.approveProof)(order.id);
        await (0, productionPrintGateService_1.syncPrintTaskBlocksForOrder)(order.id);
        await logCommRow({
            orderId: order.id,
            customerName: order.customerName,
            customerEmail: order.email,
            type: exports.INBOUND_TYPES.CUSTOMER_APPROVED,
            subject: baseSubject,
            message: bodyExcerpt,
            status: "AUTO",
            classification,
            matchConfidence: confidence,
            needsReview: false,
        });
        memLog("proof_auto_approved", { orderId: order.id });
        actions.push("proof_auto_approved");
        return {
            handled: true,
            path: "customer_reply",
            classification,
            orderId: order.id,
            matchConfidence: confidence,
            needsReview: false,
            actions,
        };
    }
    if (classification === "PROOF_REJECTED" && canAutoAct(confidence, classification)) {
        await (0, proofRoutingService_1.rejectProof)(order.id);
        await (0, productionPrintGateService_1.syncPrintTaskBlocksForOrder)(order.id);
        await logCommRow({
            orderId: order.id,
            customerName: order.customerName,
            customerEmail: order.email,
            type: exports.INBOUND_TYPES.CUSTOMER_REJECTED,
            subject: baseSubject,
            message: bodyExcerpt,
            status: "AUTO",
            classification,
            matchConfidence: confidence,
            needsReview: false,
        });
        memLog("proof_rejected_by_customer", { orderId: order.id });
        actions.push("proof_rejected_auto");
        return {
            handled: true,
            path: "customer_reply",
            orderId: order.id,
            matchConfidence: confidence,
            needsReview: false,
            actions,
        };
    }
    if (classification === "REVISION_REQUEST" && canAutoRevision(confidence)) {
        await ensureRevisionTask(order.id);
        await logCommRow({
            orderId: order.id,
            customerName: order.customerName,
            customerEmail: order.email,
            type: exports.INBOUND_TYPES.CUSTOMER_REVISION_REQUEST,
            subject: baseSubject,
            message: bodyExcerpt,
            status: "AUTO",
            classification,
            matchConfidence: confidence,
            needsReview: confidence === exports.CONFIDENCE.MEDIUM,
        });
        memLog("revision_requested", { orderId: order.id });
        actions.push("revision_task_created");
        return {
            handled: true,
            path: "customer_reply",
            classification,
            orderId: order.id,
            matchConfidence: confidence,
            needsReview: confidence === exports.CONFIDENCE.MEDIUM,
            actions,
        };
    }
    if (classification === "REVISION_REQUEST") {
        await logCommRow({
            orderId: order.id,
            customerName: order.customerName,
            customerEmail: order.email,
            type: exports.INBOUND_TYPES.CUSTOMER_REVISION_REQUEST,
            subject: baseSubject,
            message: bodyExcerpt,
            status: "REVIEW",
            classification,
            matchConfidence: confidence,
            needsReview: true,
        });
        memLog("revision_requested", { orderId: order.id, needsReview: true });
        actions.push("revision_needs_review");
        return {
            handled: true,
            path: "customer_reply",
            classification,
            orderId: order.id,
            matchConfidence: confidence,
            needsReview: true,
            actions,
        };
    }
    return {
        handled: true,
        path: "customer_reply",
        classification,
        orderId: order.id,
        matchConfidence: confidence,
        needsReview: false,
        actions,
    };
}
async function listRecentInboundReplies(take = 60) {
    const types = [
        exports.INBOUND_TYPES.CUSTOMER_REPLY,
        exports.INBOUND_TYPES.CUSTOMER_APPROVED,
        exports.INBOUND_TYPES.CUSTOMER_REJECTED,
        exports.INBOUND_TYPES.CUSTOMER_REVISION_REQUEST,
    ];
    const rows = await client_1.db.customerCommunication.findMany({
        where: { type: { in: types } },
        orderBy: { createdAt: "desc" },
        take,
        select: {
            id: true,
            orderId: true,
            customerEmail: true,
            classification: true,
            needsReview: true,
            matchConfidence: true,
            subject: true,
            message: true,
            type: true,
            createdAt: true,
        },
    });
    return rows;
}
async function listRepliesForDashboard() {
    const rows = await listRecentInboundReplies(80);
    const approvals = rows.filter((r) => r.type === exports.INBOUND_TYPES.CUSTOMER_APPROVED ||
        r.classification === "PROOF_APPROVED");
    const revisions = rows.filter((r) => r.type === exports.INBOUND_TYPES.CUSTOMER_REVISION_REQUEST ||
        r.classification === "REVISION_REQUEST");
    const unmatched = rows.filter((r) => r.orderId == null);
    const needsReview = rows.filter((r) => r.needsReview === true);
    const matched = rows.filter((r) => r.orderId != null);
    return {
        matched,
        approvals,
        revisions,
        unmatched,
        needsReview,
        count: rows.length,
    };
}
