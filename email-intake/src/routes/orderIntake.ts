import { OrderDepositStatus } from "@prisma/client";
import { Router } from "express";
import { db } from "../db/client";
import { evaluateOrderById } from "../services/orderEvaluator";
import { syncOrderToSharePoint } from "../services/sharepointOrderSync";
import {
  notifyBlockedOrder,
  notifyNewIntake,
} from "../services/teamsNotificationService";
import { logger } from "../utils/logger";
import { ART_STATUS, ensureArtPrepTask } from "../services/artRoutingService";
import { PROOF_STATUS, ensureProofApprovalTask } from "../services/proofRoutingService";

const router = Router();

function optFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function optInt(value: unknown): number | undefined {
  const n = optFiniteNumber(value);
  if (n === undefined) return undefined;
  return Math.trunc(n);
}

router.post("/api/orders/intake", async (req, res) => {
  try {
    const body = req.body ?? {};
    const customerName = body.customerName;
    const email = body.email;
    const notes = body.notes;

    const nameOk =
      typeof customerName === "string" && customerName.trim().length > 0;
    const emailOk = typeof email === "string" && email.trim().length > 0;
    const notesOk = typeof notes === "string" && notes.trim().length > 0;

    if (!nameOk || !emailOk || !notesOk) {
      res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    const phoneRaw = body.phone;
    const phone =
      typeof phoneRaw === "string" && phoneRaw.trim().length > 0
        ? phoneRaw.trim()
        : undefined;

    const garmentRaw = body.garmentType;
    const garmentType =
      typeof garmentRaw === "string" && garmentRaw.trim().length > 0
        ? garmentRaw.trim()
        : undefined;

    const methodRaw = body.printMethod;
    const printMethod =
      typeof methodRaw === "string" && methodRaw.trim().length > 0
        ? methodRaw.trim()
        : undefined;

    const quotedAmount = optFiniteNumber(body.quotedAmount);
    const totalAmount =
      optFiniteNumber(body.totalAmount) ??
      quotedAmount ??
      0;
    const depositRequired =
      optFiniteNumber(body.depositRequired) ??
      (totalAmount > 0 ? Math.round(totalAmount * 0.5 * 100) / 100 : undefined);

    const order = await db.order.create({
      data: {
        customerName: customerName.trim(),
        email: email.trim(),
        phone,
        notes: notes.trim(),
        quotedAmount,
        totalAmount,
        depositRequired,
        estimatedCost: optFiniteNumber(body.estimatedCost),
        quantity: optInt(body.quantity),
        garmentType,
        printMethod,
        status: "QUOTE_SENT",
        depositStatus: OrderDepositStatus.NONE,
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
      logger.warn(`ensureArtPrepTask after intake ${evaluated.id}: ${msg}`);
    }
    try {
      await ensureProofApprovalTask(evaluated.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`ensureProofApprovalTask after intake ${evaluated.id}: ${msg}`);
    }

    let sharepoint:
      | { success: true; action: "created" | "updated" }
      | { success: false; error: string };
    try {
      const spResult = await syncOrderToSharePoint(evaluated.id);
      sharepoint = { success: true, action: spResult.action };
    } catch (spErr) {
      const msg =
        spErr instanceof Error ? spErr.message : "SharePoint sync failed";
      logger.warn(`Intake SharePoint sync skipped/failed for ${evaluated.id}: ${msg}`);
      sharepoint = { success: false, error: msg };
    }

    const teamsIntake = await notifyNewIntake(evaluated.id);
    if (teamsIntake.success === false) {
      logger.warn(`Teams notifyNewIntake failed for ${evaluated.id}: ${teamsIntake.error}`);
    }
    if (evaluated.status === "BLOCKED") {
      const teamsBlock = await notifyBlockedOrder(evaluated.id);
      if (teamsBlock.success === false) {
        logger.warn(
          `Teams notifyBlockedOrder failed for ${evaluated.id}: ${teamsBlock.error}`
        );
      }
    }

    res.json({ success: true, order: evaluated, sharepoint });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process intake";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
