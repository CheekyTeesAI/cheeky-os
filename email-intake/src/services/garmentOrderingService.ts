import type { Order } from "@prisma/client";
import { createOrder as carolinaCreateOrder, isCarolinaMadeEnabled } from "../lib/carolinaMadeClient";
import { db } from "../db/client";
import { OrderNotFoundError } from "./orderEvaluator";
import { assertActionAllowed } from "./safetyGuard.service";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import { logger } from "../utils/logger";
import { logExceptionReviewSafe } from "./exceptionReviewService";

const VENDOR_NAME = "Carolina Made";

const ACTIVE_VENDOR_STATUSES = ["DRAFT", "SUBMITTED", "CONFIRMED"] as const;

export type CreateGarmentOrderResult =
  | {
      success: true;
      message: "Vendor order already exists";
      existingVendorOrderId: string;
    }
  | {
      success: true;
      simulated: boolean;
      vendorOrderId: string;
      vendorStatus: string;
      payload: Record<string, unknown>;
    };

function normalizeGarmentKey(garmentType: string | null | undefined): string {
  return String(garmentType ?? "")
    .trim()
    .toUpperCase();
}

/** Map order.garmentType to Carolina default style code. */
export function styleCodeFromGarmentType(
  garmentType: string | null | undefined
): string {
  const u = normalizeGarmentKey(garmentType);
  if (u.includes("HOODIE")) return "SF500";
  if (u.includes("CREW")) return "SF100";
  if (u.includes("POLO")) return "K569";
  if (
    u.includes("TEE") ||
    u.includes("T-SHIRT") ||
    u.includes("TSHIRT") ||
    u.includes("T SHIRT")
  ) {
    return "64000";
  }
  return "64000";
}

function buildVendorPayload(order: Order): Record<string, unknown> {
  const styleCode = styleCodeFromGarmentType(order.garmentType);
  return {
    vendor: VENDOR_NAME,
    styleCode,
    garmentTypeLabel: order.garmentType ?? null,
    quantity: order.quantity ?? null,
    notes: order.notes ?? "",
    customerName: order.customerName,
    customerEmail: order.email,
    orderId: order.id,
    lineItems: [
      {
        styleCode,
        quantity: order.quantity ?? 0,
      },
    ],
  };
}

function parseExternalOrderId(res: Record<string, unknown>): string | null {
  const raw =
    res.externalOrderId ??
    res.orderId ??
    res.id ??
    (res.data as Record<string, unknown> | undefined)?.orderId;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s || null;
}

export async function createGarmentOrderForOrder(
  orderId: string
): Promise<CreateGarmentOrderResult> {
  const id = String(orderId ?? "").trim();
  if (!id) {
    throw new Error("Missing order id");
  }

  const order = await db.order.findUnique({ where: { id } });
  if (!order) {
    throw new OrderNotFoundError(id);
  }

  assertActionAllowed(order, "ORDER_GARMENTS");

  const existing = await db.vendorOrder.findFirst({
    where: {
      orderId: id,
      vendorName: VENDOR_NAME,
      status: { in: [...ACTIVE_VENDOR_STATUSES] },
    },
  });

  if (existing) {
    return {
      success: true,
      message: "Vendor order already exists",
      existingVendorOrderId: existing.id,
    };
  }

  const payload = buildVendorPayload(order);
  const payloadJson = JSON.stringify(payload);
  const enabled = isCarolinaMadeEnabled();
  const now = new Date();

  const vendorOrder = await db.vendorOrder.create({
    data: {
      orderId: id,
      vendorName: VENDOR_NAME,
      status: "DRAFT",
      payloadJson,
      simulated: !enabled,
    },
  });

  try {
    if (enabled) {
      const res = await carolinaCreateOrder(payload);
      const responseJson = JSON.stringify(res);
      const externalOrderId = parseExternalOrderId(res);

      await db.vendorOrder.update({
        where: { id: vendorOrder.id },
        data: {
          status: "SUBMITTED",
          responseJson,
          externalOrderId: externalOrderId ?? undefined,
          simulated: false,
        },
      });

      await db.order.update({
        where: { id },
        data: {
          garmentVendor: VENDOR_NAME,
          garmentOrderStatus: "SUBMITTED",
          garmentOrderPlacedAt: now,
        },
      });

      try {
        await syncOrderToSharePoint(id);
      } catch (spErr) {
        const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
        logger.warn(`garmentOrderingService: SharePoint sync failed for ${id}: ${spMsg}`);
      }

      const updated = await db.vendorOrder.findUniqueOrThrow({
        where: { id: vendorOrder.id },
      });

      return {
        success: true,
        simulated: false,
        vendorOrderId: updated.id,
        vendorStatus: updated.status,
        payload,
      };
    }

    const simulatedResponse = {
      simulated: true,
      message: "CAROLINA_MADE_ENABLED is not true — no vendor API call",
      stubExternalOrderId: null as string | null,
      at: now.toISOString(),
    };
    await db.vendorOrder.update({
      where: { id: vendorOrder.id },
      data: {
        status: "DRAFT",
        responseJson: JSON.stringify(simulatedResponse),
        simulated: true,
      },
    });

    await db.order.update({
      where: { id },
      data: {
        garmentVendor: VENDOR_NAME,
        garmentOrderStatus: "DRAFT",
        garmentOrderPlacedAt: null,
      },
    });

    try {
      await syncOrderToSharePoint(id);
    } catch (spErr) {
      const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
      logger.warn(`garmentOrderingService: SharePoint sync failed for ${id}: ${spMsg}`);
    }

    const updated = await db.vendorOrder.findUniqueOrThrow({
      where: { id: vendorOrder.id },
    });

    return {
      success: true,
      simulated: true,
      vendorOrderId: updated.id,
      vendorStatus: updated.status,
      payload,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logExceptionReviewSafe({
      orderId: id,
      jobId: null,
      type: "GARMENT_ORDER_FAILED",
      source: "GARMENT_ORDER",
      severity: "HIGH",
      message: msg.slice(0, 2000),
      detailsJson: JSON.stringify({ vendor: VENDOR_NAME }),
    });
    await db.vendorOrder.update({
      where: { id: vendorOrder.id },
      data: {
        status: "FAILED",
        responseJson: JSON.stringify({ error: msg, at: new Date().toISOString() }),
        simulated: !enabled,
      },
    });
    await db.order.update({
      where: { id },
      data: {
        garmentVendor: VENDOR_NAME,
        garmentOrderStatus: "FAILED",
      },
    });
    throw err;
  }
}
