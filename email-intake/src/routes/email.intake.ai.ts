import { Router, Request, Response } from "express";
import { brain } from "../core/brain";
import { db } from "../db/client";
import { generateTasksForOrder } from "../services/taskGenerator";
import { sendEstimate } from "../services/estimateSendService";
import { runSalesAgentForOrder } from "../services/salesAgent";

const router = Router();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapProductionType(printMethod: string): string {
  const pm = printMethod.trim().toUpperCase().replace(/[_\s-]+/g, "_");
  if (pm === "DTG" || pm === "SCREEN" || pm === "DTF" || pm === "HEAT_PRESS") return pm;
  if (pm === "HEATPRESS") return "HEAT_PRESS";
  return "OTHER";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post("/email/intake", async (req: Request, res: Response) => {
  try {
    const from = asString(req.body?.from);
    const subject = asString(req.body?.subject);
    const body = asString(req.body?.body);

    const parserInput = `Subject: ${subject}\n\nBody:\n${body}`;
    const parsed = await brain(parserInput);

    const parsedCustomerName = asString((parsed as any)?.customerName);
    const parsedEmail = asString((parsed as any)?.email);
    const customerEmail = parsedEmail || from;
    const customerName = parsedCustomerName || "Unknown Customer";

    if (!customerEmail) {
      console.error("[email.intake.ai] Missing customer email (from + parser)");
      res.status(200).json({ status: "NEEDS_REVIEW" });
      return;
    }

    const customer = await db.customer.upsert({
      where: { email: customerEmail },
      update: { name: customerName },
      create: { email: customerEmail, name: customerName },
      select: { id: true },
    });

    const parseSuccess = String((parsed as any)?.intent || "").toUpperCase() === "CREATE_INVOICE";
    const quantity = Number((parsed as any)?.quantity ?? 0);
    const unitPrice = Number((parsed as any)?.unitPrice ?? 0);
    const printMethod = asString((parsed as any)?.printMethod);
    const parsedNotes = asString((parsed as any)?.notes);
    const parsedItems = Array.isArray((parsed as any)?.items) ? (parsed as any).items : [];

    const isComplete = parseSuccess && quantity > 0 && unitPrice > 0;
    const status = isComplete ? "QUOTE" : "NEEDS_REVIEW";
    const orderData: Record<string, unknown> = {
      orderNumber: `CHK-${Date.now()}`,
      customerId: customer.id,
      status,
      source: "EMAIL",
      totalAmount: isComplete ? quantity * unitPrice : 0,
      depositAmount: 0,
      notes: isComplete ? (parsedNotes || undefined) : body,
    };

    const order = await db.order.create({
      data: orderData as any,
      select: { id: true },
    });

    if (isComplete && parsedItems.length > 0) {
      const defaultProductionType = mapProductionType(printMethod);
      await db.lineItem.createMany({
        data: parsedItems.map((item: any) => {
          const itemQuantity = Number(item?.quantity ?? quantity ?? 1);
          const itemUnitPrice = Number(item?.unitPrice ?? unitPrice ?? 0);
          const itemPrintMethod = asString(item?.printMethod) || printMethod;
          const description = asString(item?.description) || subject || "Email intake item";
          return {
            orderId: order.id,
            description,
            quantity: Number.isFinite(itemQuantity) && itemQuantity > 0 ? itemQuantity : 1,
            unitPrice: Number.isFinite(itemUnitPrice) ? itemUnitPrice : 0,
            productionType: mapProductionType(itemPrintMethod || defaultProductionType),
            designRef: asString(item?.designRef) || undefined,
          };
        }),
      });
    }

    try {
      const lineCount = await db.lineItem.count({ where: { orderId: order.id } });
      if (lineCount > 0 && isValidEmail(customerEmail)) {
        await sendEstimate(order.id);
      }
    } catch (sendErr) {
      console.error("[email.intake.ai] sendEstimate failed (non-fatal)", sendErr);
    }

    const beforeCount = await db.task.count({ where: { orderId: order.id } });
    await generateTasksForOrder(order.id);
    const afterCount = await db.task.count({ where: { orderId: order.id } });
    const tasksCreated = Math.max(0, afterCount - beforeCount);

    try {
      if (
        isValidEmail(customerEmail) &&
        (status === "QUOTE" || status === "NEEDS_REVIEW")
      ) {
        await runSalesAgentForOrder(order.id, {
          autoSend: false,
          channel: "console",
          reason: "new_lead",
        });
      }
    } catch (salesErr) {
      console.error("[email.intake.ai] sales agent (non-fatal)", salesErr);
    }

    if (!isComplete) {
      res.status(200).json({ orderId: order.id, status: "NEEDS_REVIEW" });
      return;
    }

    res.status(200).json({
      orderId: order.id,
      customerId: customer.id,
      tasksCreated,
    });
  } catch (error) {
    console.error("[email.intake.ai] Failed to process email intake", error);
    res.status(200).json({ status: "NEEDS_REVIEW" });
  }
});

export default router;
