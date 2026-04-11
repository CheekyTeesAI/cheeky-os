import type { Order } from "@prisma/client";
import { db } from "../db/client";
import type { ParsedEmailIntake } from "./emailIntakeParser";
import { evaluateOrderById } from "./orderEvaluator";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import {
  notifyBlockedOrder,
  notifyNewIntake,
} from "./teamsNotificationService";
import { logger } from "../utils/logger";

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

  const order = await db.order.create({
    data: {
      customerName: parsed.customerName,
      email: parsed.email,
      phone: parsed.phone ?? undefined,
      notes,
      quantity: parsed.quantity ?? undefined,
      garmentType: parsed.garmentType ?? undefined,
      printMethod: parsed.printMethod ?? undefined,
      quotedAmount: parsed.quotedAmount ?? undefined,
      estimatedCost: parsed.estimatedCost ?? undefined,
      status: "INTAKE",
      outlookMessageId: options.outlookMessageId?.trim() || undefined,
    },
  });

  const evaluated = await evaluateOrderById(order.id);

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
