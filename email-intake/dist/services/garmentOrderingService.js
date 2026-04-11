"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.styleCodeFromGarmentType = styleCodeFromGarmentType;
exports.createGarmentOrderForOrder = createGarmentOrderForOrder;
const carolinaMadeClient_1 = require("../lib/carolinaMadeClient");
const client_1 = require("../db/client");
const orderEvaluator_1 = require("./orderEvaluator");
const safetyGuard_service_1 = require("./safetyGuard.service");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const logger_1 = require("../utils/logger");
const exceptionReviewService_1 = require("./exceptionReviewService");
const VENDOR_NAME = "Carolina Made";
const ACTIVE_VENDOR_STATUSES = ["DRAFT", "SUBMITTED", "CONFIRMED"];
function normalizeGarmentKey(garmentType) {
    return String(garmentType ?? "")
        .trim()
        .toUpperCase();
}
/** Map order.garmentType to Carolina default style code. */
function styleCodeFromGarmentType(garmentType) {
    const u = normalizeGarmentKey(garmentType);
    if (u.includes("HOODIE"))
        return "SF500";
    if (u.includes("CREW"))
        return "SF100";
    if (u.includes("POLO"))
        return "K569";
    if (u.includes("TEE") ||
        u.includes("T-SHIRT") ||
        u.includes("TSHIRT") ||
        u.includes("T SHIRT")) {
        return "64000";
    }
    return "64000";
}
function buildVendorPayload(order) {
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
function parseExternalOrderId(res) {
    const raw = res.externalOrderId ??
        res.orderId ??
        res.id ??
        res.data?.orderId;
    if (raw === null || raw === undefined)
        return null;
    const s = String(raw).trim();
    return s || null;
}
async function createGarmentOrderForOrder(orderId) {
    const id = String(orderId ?? "").trim();
    if (!id) {
        throw new Error("Missing order id");
    }
    const order = await client_1.db.order.findUnique({ where: { id } });
    if (!order) {
        throw new orderEvaluator_1.OrderNotFoundError(id);
    }
    (0, safetyGuard_service_1.assertActionAllowed)(order, "ORDER_GARMENTS");
    const existing = await client_1.db.vendorOrder.findFirst({
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
    const enabled = (0, carolinaMadeClient_1.isCarolinaMadeEnabled)();
    const now = new Date();
    const vendorOrder = await client_1.db.vendorOrder.create({
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
            const res = await (0, carolinaMadeClient_1.createOrder)(payload);
            const responseJson = JSON.stringify(res);
            const externalOrderId = parseExternalOrderId(res);
            await client_1.db.vendorOrder.update({
                where: { id: vendorOrder.id },
                data: {
                    status: "SUBMITTED",
                    responseJson,
                    externalOrderId: externalOrderId ?? undefined,
                    simulated: false,
                },
            });
            await client_1.db.order.update({
                where: { id },
                data: {
                    garmentVendor: VENDOR_NAME,
                    garmentOrderStatus: "SUBMITTED",
                    garmentOrderPlacedAt: now,
                },
            });
            try {
                await (0, sharepointOrderSync_1.syncOrderToSharePoint)(id);
            }
            catch (spErr) {
                const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
                logger_1.logger.warn(`garmentOrderingService: SharePoint sync failed for ${id}: ${spMsg}`);
            }
            const updated = await client_1.db.vendorOrder.findUniqueOrThrow({
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
            stubExternalOrderId: null,
            at: now.toISOString(),
        };
        await client_1.db.vendorOrder.update({
            where: { id: vendorOrder.id },
            data: {
                status: "DRAFT",
                responseJson: JSON.stringify(simulatedResponse),
                simulated: true,
            },
        });
        await client_1.db.order.update({
            where: { id },
            data: {
                garmentVendor: VENDOR_NAME,
                garmentOrderStatus: "DRAFT",
                garmentOrderPlacedAt: null,
            },
        });
        try {
            await (0, sharepointOrderSync_1.syncOrderToSharePoint)(id);
        }
        catch (spErr) {
            const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
            logger_1.logger.warn(`garmentOrderingService: SharePoint sync failed for ${id}: ${spMsg}`);
        }
        const updated = await client_1.db.vendorOrder.findUniqueOrThrow({
            where: { id: vendorOrder.id },
        });
        return {
            success: true,
            simulated: true,
            vendorOrderId: updated.id,
            vendorStatus: updated.status,
            payload,
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        (0, exceptionReviewService_1.logExceptionReviewSafe)({
            orderId: id,
            jobId: null,
            type: "GARMENT_ORDER_FAILED",
            source: "GARMENT_ORDER",
            severity: "HIGH",
            message: msg.slice(0, 2000),
            detailsJson: JSON.stringify({ vendor: VENDOR_NAME }),
        });
        await client_1.db.vendorOrder.update({
            where: { id: vendorOrder.id },
            data: {
                status: "FAILED",
                responseJson: JSON.stringify({ error: msg, at: new Date().toISOString() }),
                simulated: !enabled,
            },
        });
        await client_1.db.order.update({
            where: { id },
            data: {
                garmentVendor: VENDOR_NAME,
                garmentOrderStatus: "FAILED",
            },
        });
        throw err;
    }
}
