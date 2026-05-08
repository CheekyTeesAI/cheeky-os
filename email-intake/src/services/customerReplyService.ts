import path from "path";
import type { Order } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import {
  classifyCustomerReply,
  type ReplyClassification,
} from "../lib/customerReplyClassifier";
import { approveProof, rejectProof } from "./proofRoutingService";
import { syncPrintTaskBlocksForOrder } from "./productionPrintGateService";

export const INBOUND_TYPES = {
  CUSTOMER_REPLY: "CUSTOMER_REPLY",
  CUSTOMER_APPROVED: "CUSTOMER_APPROVED",
  CUSTOMER_REJECTED: "CUSTOMER_REJECTED",
  CUSTOMER_REVISION_REQUEST: "CUSTOMER_REVISION_REQUEST",
} as const;

export const CONFIDENCE = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  NONE: "NONE",
} as const;

export type MatchResult = {
  order: Order | null;
  confidence: (typeof CONFIDENCE)[keyof typeof CONFIDENCE];
};

function normEmail(e: string): string {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function excerpt(s: string, max = 500): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * 1) Explicit order # / id in subject+body
 * 2) Customer email → most recently updated open order(s)
 * 3) Recent outbound comm to same email → thread orderId
 * 4) Fallback: latest order for email
 */
export async function matchReplyToOrder(input: {
  subject: string;
  body: string;
  fromEmail: string;
}): Promise<MatchResult> {
  const blob = `${input.subject}\n${input.body}`;
  const uuid = blob.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  if (uuid) {
    const o = await db.order.findFirst({
      where: { id: uuid[0], deletedAt: null },
    });
    if (o) return { order: o, confidence: CONFIDENCE.HIGH };
  }

  const chk = blob.match(/\bCHK-\d+\b/i);
  if (chk) {
    const o = await db.order.findFirst({
      where: { orderNumber: chk[0], deletedAt: null },
    });
    if (o) return { order: o, confidence: CONFIDENCE.HIGH };
  }

  const onum = blob.match(/\border\s*#?\s*([A-Z0-9CHK.-]+)/i);
  if (onum && onum[1]) {
    const token = onum[1].trim();
    const o = await db.order.findFirst({
      where: {
        deletedAt: null,
        OR: [{ orderNumber: token }, { id: token }],
      },
    });
    if (o) return { order: o, confidence: CONFIDENCE.HIGH };
  }

  const em = normEmail(input.fromEmail);
  if (!em) return { order: null, confidence: CONFIDENCE.NONE };

  const thread = await (db as any).customerCommunication.findFirst({
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
    const o = await db.order.findFirst({
      where: { id: thread.orderId, deletedAt: null },
    });
    if (o) return { order: o, confidence: CONFIDENCE.MEDIUM };
  }

  const sameEmail = await db.order.findMany({
    where: {
      deletedAt: null,
      email: { equals: em, mode: "insensitive" },
      status: { not: "CANCELLED" },
    },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  if (sameEmail.length === 1) {
    return { order: sameEmail[0], confidence: CONFIDENCE.MEDIUM };
  }
  if (sameEmail.length > 1) {
    return { order: sameEmail[0], confidence: CONFIDENCE.LOW };
  }

  const byCustomer = await db.order.findMany({
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
    return { order: byCustomer[0], confidence: CONFIDENCE.MEDIUM };
  }
  if (byCustomer.length > 1) {
    return { order: byCustomer[0], confidence: CONFIDENCE.LOW };
  }

  return { order: null, confidence: CONFIDENCE.NONE };
}

function memLog(type: string, data: Record<string, unknown>): void {
  try {
    // Runtime: dist/services → ../../src/services/memoryService.js
    const ms = require(path.join(
      __dirname,
      "..",
      "..",
      "src",
      "services",
      "memoryService.js"
    ));
    if (typeof ms.logEvent === "function") ms.logEvent(type, data);
  } catch {
    /* optional */
  }
}

async function logCommRow(data: {
  orderId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  type: string;
  subject: string;
  message: string;
  status: string;
  classification?: string | null;
  needsReview?: boolean;
  matchConfidence?: string | null;
}): Promise<{ id: string }> {
  const row = await (db as any).customerCommunication.create({
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

async function ensureRevisionTask(orderId: string): Promise<void> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: { tasks: { select: { type: true } } },
  });
  if (!order) return;
  if (order.tasks.some((t) => t.type === "REVISION_REQUEST")) return;
  const job = await db.job.findUnique({ where: { orderId } });
  if (!job) return;
  const label = order.orderNumber ?? orderId.slice(0, 8);
  await db.task.create({
    data: {
      orderId,
      jobId: job.id,
      title: `Customer requested proof revision for Order #${label}`,
      type: "REVISION_REQUEST",
      status: "PENDING",
    },
  });
}

export type ProcessReplyResult = {
  handled: boolean;
  path: "customer_reply" | "intake";
  classification?: ReplyClassification;
  orderId?: string | null;
  matchConfidence?: string;
  needsReview?: boolean;
  actions?: string[];
};

function canAutoAct(
  confidence: string,
  classification: ReplyClassification
): boolean {
  if (confidence !== CONFIDENCE.HIGH) return false;
  return (
    classification === "PROOF_APPROVED" || classification === "PROOF_REJECTED"
  );
}

function canAutoRevision(confidence: string): boolean {
  return confidence === CONFIDENCE.HIGH || confidence === CONFIDENCE.MEDIUM;
}

/**
 * Inbound pipeline: classify → match → log → optional order updates (safe gates).
 */
export async function processInboundCustomerReply(input: {
  subject: string;
  body: string;
  fromEmail: string;
  customerName?: string | null;
}): Promise<ProcessReplyResult> {
  const classification = classifyCustomerReply({
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
  const actions: string[] = [];

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
      type: INBOUND_TYPES.CUSTOMER_REPLY,
      needsReview: true,
    });
    memLog("unmatched_customer_reply", {
      classification,
      from: input.fromEmail,
      matchConfidence: confidence,
    });
    logger.info(
      `[customerReply] unmatched classification=${classification} from=${input.fromEmail}`
    );
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

  const blockProofAuto =
    classification === "PROOF_APPROVED" || classification === "PROOF_REJECTED"
      ? !canAutoAct(confidence, classification)
      : false;

  const needsReview =
    confidence === CONFIDENCE.LOW ||
    classification === "UNKNOWN" ||
    blockProofAuto;

  await logCommRow({
    ...logMeta,
    orderId: order.id,
    type: INBOUND_TYPES.CUSTOMER_REPLY,
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
    await approveProof(order.id);
    await syncPrintTaskBlocksForOrder(order.id);
    await logCommRow({
      orderId: order.id,
      customerName: order.customerName,
      customerEmail: order.email,
      type: INBOUND_TYPES.CUSTOMER_APPROVED,
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
    await rejectProof(order.id);
    await syncPrintTaskBlocksForOrder(order.id);
    await logCommRow({
      orderId: order.id,
      customerName: order.customerName,
      customerEmail: order.email,
      type: INBOUND_TYPES.CUSTOMER_REJECTED,
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
      type: INBOUND_TYPES.CUSTOMER_REVISION_REQUEST,
      subject: baseSubject,
      message: bodyExcerpt,
      status: "AUTO",
      classification,
      matchConfidence: confidence,
      needsReview: confidence === CONFIDENCE.MEDIUM,
    });
    memLog("revision_requested", { orderId: order.id });
    actions.push("revision_task_created");
    return {
      handled: true,
      path: "customer_reply",
      classification,
      orderId: order.id,
      matchConfidence: confidence,
      needsReview: confidence === CONFIDENCE.MEDIUM,
      actions,
    };
  }

  if (classification === "REVISION_REQUEST") {
    await logCommRow({
      orderId: order.id,
      customerName: order.customerName,
      customerEmail: order.email,
      type: INBOUND_TYPES.CUSTOMER_REVISION_REQUEST,
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

export async function listRecentInboundReplies(take = 60): Promise<
  Array<{
    id: string;
    orderId: string | null;
    customerEmail: string | null;
    classification: string | null;
    needsReview: boolean;
    matchConfidence: string | null;
    subject: string;
    message: string;
    type: string;
    createdAt: Date;
  }>
> {
  const types = [
    INBOUND_TYPES.CUSTOMER_REPLY,
    INBOUND_TYPES.CUSTOMER_APPROVED,
    INBOUND_TYPES.CUSTOMER_REJECTED,
    INBOUND_TYPES.CUSTOMER_REVISION_REQUEST,
  ];
  const rows = await (db as any).customerCommunication.findMany({
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

export async function listRepliesForDashboard(): Promise<{
  matched: Awaited<ReturnType<typeof listRecentInboundReplies>>;
  approvals: Awaited<ReturnType<typeof listRecentInboundReplies>>;
  revisions: Awaited<ReturnType<typeof listRecentInboundReplies>>;
  unmatched: Awaited<ReturnType<typeof listRecentInboundReplies>>;
  needsReview: Awaited<ReturnType<typeof listRecentInboundReplies>>;
  count: number;
}> {
  const rows = await listRecentInboundReplies(80);
  const approvals = rows.filter(
    (r) =>
      r.type === INBOUND_TYPES.CUSTOMER_APPROVED ||
      r.classification === "PROOF_APPROVED"
  );
  const revisions = rows.filter(
    (r) =>
      r.type === INBOUND_TYPES.CUSTOMER_REVISION_REQUEST ||
      r.classification === "REVISION_REQUEST"
  );
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
