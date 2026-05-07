import type { Order } from "@prisma/client";
import { OrderDepositStatus } from "@prisma/client";
import { db } from "../db/client";
import type { ParsedEmailIntake } from "./emailIntakeParser";
import { evaluateOrderById } from "./orderEvaluator";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import {
  notifyBlockedOrder,
  notifyNewIntake,
} from "./teamsNotificationService";
import { logger } from "../utils/logger";
import { ART_STATUS, ensureArtPrepTask } from "./artRoutingService";
import { PROOF_STATUS, ensureProofApprovalTask } from "./proofRoutingService";

export type EmailIntakePipelineResult = {
  parsed: ParsedEmailIntake;
  order: Order;
  sharepoint: { success: boolean; error?: string };
  teamsIntake: { success: boolean; error?: string };
  teamsBlocked?: { success: boolean; error?: string };
};

export async function findDuplicateOutlookIntake(
  messageId: string
): Promise<Order | null> {
  const trimmed = messageId.trim();
  if (!trimmed) return null;
  return db.order.findFirst({
    where: {
      OR: [
        { outlookMessageId: trimmed },
        { notes: { contains: trimmed } },
      ],
    },
  });
}

export async function executeEmailIntakePipeline(
  parsed: ParsedEmailIntake,
  options: {
    outlookMessageId?: string | null;
    extraNotes?: string;
  } = {}
): Promise<EmailIntakePipelineResult> {
  const extra = options.extraNotes?.trim();
  let notes = parsed.notes;
  if (extra) {
    notes = notes.trim().length > 0 ? `${notes}\n\n${extra}` : extra;
  }

  const quotedAmount = parsed.quotedAmount ?? undefined;
  const totalAmount =
    parsed.quotedAmount != null && parsed.quotedAmount > 0
      ? parsed.quotedAmount
      : 0;
  const depositRequired =
    totalAmount > 0 ? Math.round(totalAmount * 0.5 * 100) / 100 : undefined;

  const order = await db.order.create({
    data: {
      customerName: parsed.customerName,
      email: parsed.email,
      phone: parsed.phone ?? undefined,
      notes,
      quantity: parsed.quantity ?? undefined,
      garmentType: parsed.garmentType ?? undefined,
      printMethod: parsed.printMethod ?? undefined,
      quotedAmount,
      totalAmount,
      depositRequired,
      estimatedCost: parsed.estimatedCost ?? undefined,
      status: "QUOTE_SENT",
      depositStatus: OrderDepositStatus.NONE,
      outlookMessageId: options.outlookMessageId?.trim() || undefined,
      artFileStatus: ART_STATUS.NOT_READY,
      proofRequired: true,
      proofStatus: PROOF_STATUS.NOT_SENT,
    } as any,
  });

  const evaluated = await evaluateOrderById(order.id);

  try {
    await ensureArtPrepTask(evaluated.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`ensureArtPrepTask after email intake ${evaluated.id}: ${msg}`);
  }
  try {
    await ensureProofApprovalTask(evaluated.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`ensureProofApprovalTask after email intake ${evaluated.id}: ${msg}`);
  }

  let sharepoint: { success: boolean; error?: string } = { success: true };
  try {
    await syncOrderToSharePoint(evaluated.id);
  } catch (spErr) {
    const msg =
      spErr instanceof Error ? spErr.message : "SharePoint sync failed";
    logger.warn(
      `Email intake pipeline SharePoint failed for ${evaluated.id}: ${msg}`
    );
    sharepoint = { success: false, error: msg };
  }

  const teamsIntakeResult = await notifyNewIntake(evaluated.id);
  const teamsIntake =
    teamsIntakeResult.success === true
      ? { success: true as const }
      : {
          success: false as const,
          error: teamsIntakeResult.error,
        };

  let teamsBlocked: EmailIntakePipelineResult["teamsBlocked"];
  if (evaluated.status === "BLOCKED") {
    const tb = await notifyBlockedOrder(evaluated.id);
    teamsBlocked =
      tb.success === true
        ? { success: true }
        : { success: false, error: tb.error };
  }

  return {
    parsed,
    order: evaluated,
    sharepoint,
    teamsIntake,
    teamsBlocked,
  };
}
