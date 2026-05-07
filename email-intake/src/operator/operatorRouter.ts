import express from "express";
import { buildDepositFollowupsPayload } from "../services/depositFollowupService";
import {
  buildGarmentOrdersPayload,
  markGarmentsOrdered,
  markGarmentsReceived,
} from "../services/garmentOperatorService";
import {
  listOrdersNeedingArt,
  markArtReady,
  sendOrderToDigitizer,
} from "../services/artRoutingService";
import {
  approveProof,
  listOrdersProofQueue,
} from "../services/proofRoutingService";
import {
  getCustomerCommsDigest,
  getOrdersNeedingDepositReminder,
  listRecentCommunications,
  sendDepositReminder,
  sendPickupReady,
  sendProofRequestComm,
} from "../services/customerCommsService";
import {
  INBOUND_TYPES,
  listRecentInboundReplies,
} from "../services/customerReplyService";
import {
  generateWorkOrder,
  isWorkOrderReady,
  listWorkOrdersReady,
  loadOrderForWorkOrder,
  markWorkOrderPrinted,
} from "../services/workOrderService";
import {
  QUOTE_RULES,
  buildSquareDraftFromQuote,
  calculateQuote,
  validateQuoteInput,
  type QuoteInput,
} from "../services/quoteEngine";
import {
  createDraftEstimate,
  listDraftInvoicesForFollowup
} from "../services/jarvisSquareService";
import { listIntakesEligibleForPrinting } from "../services/intakeQueuePrintingService";

type OperatorResult =
  | { ok: true; result: any }
  | { ok: false; status: number; error: string };

const MS_DAY = 24 * 60 * 60 * 1000;

const roundPrice = (price: number): number => {
  if (price < 20) return Math.round(price * 2) / 2;
  if (price < 30) return Math.round(price * 2) / 2;
  return Math.ceil(price);
};

function invoiceMoneyToTotal(m: unknown): number | null {
  if (!m || typeof m !== "object") return null;
  const amt = (m as { amount?: unknown }).amount;
  if (typeof amt === "bigint") return Number(amt) / 100;
  if (typeof amt === "number") return amt / 100;
  return null;
}

function invoiceCustomerName(inv: Record<string, unknown>): string {
  const title = String(inv.title ?? "").trim();
  const m = title.match(/^estimate\s*[—-]\s*(.+)$/i);
  return m ? m[1].trim() : title || "Customer";
}

function parseEstimateText(text: string):
  | { ok: true; quantity: number; printColors: number; isSchool: boolean; garmentType: string }
  | { ok: false } {
  const t = text.trim();
  if (!t) return { ok: false };
  const qtyMatch = t.match(/\d+/);
  if (!qtyMatch) return { ok: false };
  const quantity = Number(qtyMatch[0]);
  if (!Number.isFinite(quantity) || quantity < 1) return { ok: false };

  let printColors = 1;
  const colorMatch = t.match(/\b(\d+)\s*colors?\b/i);
  if (colorMatch) {
    const n = Number(colorMatch[1]);
    if (Number.isFinite(n) && n >= 1) printColors = Math.floor(n);
  }

  const isSchool = /\bschool\b/i.test(t) || /\bnonprofit\b/i.test(t);
  const garmentType = /\bdark\b/i.test(t) ? "dark" : "light";

  return { ok: true, quantity, printColors, isSchool, garmentType };
}

async function handleOperatorCommand(input: {
  command: unknown;
  data?: unknown;
}): Promise<OperatorResult> {
  try {
    const { command, data } = input;

    if (
      command === undefined ||
      command === null ||
      (typeof command === "string" && command.trim() === "")
    ) {
      return { ok: false, status: 400, error: "Missing command" };
    }

    let result: any;

    switch (command) {
      case "create_estimate": {
        const d =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>)
            : {};
        if ((d as { confirm?: unknown }).confirm !== true) {
          return { ok: false, status: 400, error: "Confirmation required" };
        }
        let work: Record<string, unknown> = { ...(d as Record<string, unknown>) };
        const textRaw = (d as { text?: unknown }).text;
        if (typeof textRaw === "string" && textRaw.trim()) {
          const parsed = parseEstimateText(textRaw);
          if (!parsed.ok) {
            return { ok: false, status: 400, error: "Could not parse input" };
          }
          work = {
            ...work,
            quantity: parsed.quantity,
            printColors: parsed.printColors,
            isSchool: parsed.isSchool,
            garmentType: parsed.garmentType
          };
        }

        const lineItems = Array.isArray((work as { lineItems?: unknown }).lineItems)
          ? (work as { lineItems: { quantity?: unknown; unitPrice?: unknown; basePrice?: unknown }[] }).lineItems
          : [];
        const first = lineItems[0] || {};
        const customerName = String(
          (work as { customerName?: unknown }).customerName ??
            (work as { customer?: { name?: unknown } }).customer?.name ??
            ""
        ).trim();
        const qtyRaw = Number(first.quantity ?? (work as { quantity?: unknown }).quantity ?? 1);
        const qty = qtyRaw >= 1 ? qtyRaw : 1;

        let effColors = Number((work as { printColors?: unknown }).printColors);
        if (!Number.isFinite(effColors) || effColors < 1) effColors = 1;
        const garment = String((work as { garmentType?: unknown }).garmentType ?? "light").toLowerCase();
        if (garment === "dark") effColors += 1;

        const shirtCost = 3.15;
        const overhead = 1.0;
        let basePrint = 2.85;
        if (qty >= 500) basePrint = 1.45;
        else if (qty >= 250) basePrint = 1.65;
        else if (qty >= 144) basePrint = 1.85;
        else if (qty >= 72) basePrint = 2.05;
        else if (qty >= 24) basePrint = 2.35;
        const printCost = basePrint * effColors;
        const trueCost = shirtCost + printCost + overhead;

        const tpRaw = (work as { targetProfit?: unknown }).targetProfit;
        const profitMode =
          tpRaw !== undefined &&
          tpRaw !== null &&
          tpRaw !== "" &&
          Number.isFinite(Number(tpRaw));

        let unitPrice: number;
        let pricingMode: "profit" | "margin";

        if (profitMode) {
          const targetProfit = Number(tpRaw);
          const profitPerUnit = targetProfit / qty;
          unitPrice = Math.ceil((trueCost + profitPerUnit) * 100) / 100;
          pricingMode = "profit";
        } else {
          let marginUsed =
            qty < 24 ? 0.7 : qty < 72 ? 0.6 : qty < 144 ? 0.55 : qty < 250 ? 0.5 : qty < 500 ? 0.45 : 0.4;
          if ((work as { isSchool?: unknown }).isSchool === true) {
            marginUsed -= 0.05;
            if (marginUsed < 0.4) marginUsed = 0.4;
          }
          unitPrice = Math.ceil(trueCost / (1 - marginUsed));
          pricingMode = "margin";
        }

        unitPrice = roundPrice(unitPrice);

        let outputMode: "margin" | "profit" | "guardrail_adjusted" = pricingMode;
        const actualMargin =
          unitPrice > 0 ? (unitPrice - trueCost) / unitPrice : 0;
        if (actualMargin < 0.4) {
          unitPrice = Math.ceil(trueCost / (1 - 0.4));
          outputMode = "guardrail_adjusted";
        }

        try {
          const created = await createDraftEstimate({
            customerName,
            quantity: qty,
            unitPrice
          });
          const margin =
            unitPrice > 0 ? (unitPrice - trueCost) / unitPrice : 0;
          result = {
            estimateId: created.invoiceId,
            unitPrice,
            totalRevenue: unitPrice * qty,
            totalCost: trueCost * qty,
            profit: (unitPrice - trueCost) * qty,
            margin,
            mode: outputMode
          };
          const discRaw = (work as { discountPercent?: unknown }).discountPercent;
          if (
            discRaw !== undefined &&
            discRaw !== null &&
            discRaw !== "" &&
            Number.isFinite(Number(discRaw))
          ) {
            const discount = Number(discRaw) / 100;
            const discountedUnitPrice =
              Math.round(unitPrice * (1 - discount) * 100) / 100;
            result = {
              ...(typeof result === "object" && result !== null ? result : {}),
              discountedUnitPrice
            };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, status: 500, error: message };
        }
        break;
      }

      case "create_invoice": {
        const invData =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>)
            : {};
        if ((invData as { confirm?: unknown }).confirm !== true) {
          return { ok: false, status: 400, error: "Confirmation required" };
        }
        result = { invoiceId: "temp_456" };
        break;
      }

      case "what_needs_printing": {
        const pq = await listIntakesEligibleForPrinting();
        if (!pq.ok) {
          return { ok: false, status: 502, error: pq.error || "print_queue_failed" };
        }
        const jobs =
          pq.jobs?.map((j) => ({
            orderId: j.orderId,
            intakeId: j.orderId,
            customer: j.customer,
            customerName: j.customer,
            status: j.status === "AI_PARSED" ? "parsed_ready_for_ops" : "intake_new",
            requestText: j.requestText,
            parsedJsonPreview: j.parsedJson?.slice?.(0, 500) ?? null,
            createdon: j.createdon,
          })) ?? [];
        result = {
          jobs,
          source: "dataverse_intake_queue",
          count: jobs.length,
        };
        break;
      }

      case "get_deposit_followups": {
        result = await buildDepositFollowupsPayload();
        break;
      }

      case "get_garment_orders": {
        result = await buildGarmentOrdersPayload();
        break;
      }

      case "mark_garments_ordered": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await markGarmentsOrdered(oid);
        break;
      }

      case "mark_garments_received": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await markGarmentsReceived(oid);
        break;
      }

      case "orders_needing_art": {
        result = { orders: await listOrdersNeedingArt() };
        break;
      }

      case "send_order_to_digitizer": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await sendOrderToDigitizer(oid);
        break;
      }

      case "mark_art_ready": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await markArtReady(oid);
        break;
      }

      case "orders_needing_proof": {
        result = { orders: await listOrdersProofQueue() };
        break;
      }

      case "send_proof": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await sendProofRequestComm(oid);
        break;
      }

      case "send_deposit_reminder": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await sendDepositReminder(oid);
        break;
      }

      case "send_pickup_ready": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await sendPickupReady(oid);
        break;
      }

      case "recent_customer_communications": {
        result = { entries: await listRecentCommunications(40) };
        break;
      }

      case "customer_replies": {
        result = { replies: await listRecentInboundReplies(50) };
        break;
      }

      case "proofs_approved_by_customer": {
        const rows = await listRecentInboundReplies(80);
        result = {
          replies: rows.filter(
            (r) =>
              r.type === INBOUND_TYPES.CUSTOMER_APPROVED ||
              r.classification === "PROOF_APPROVED"
          ),
        };
        break;
      }

      case "revision_requests_from_customers": {
        const rows = await listRecentInboundReplies(80);
        result = {
          replies: rows.filter(
            (r) =>
              r.type === INBOUND_TYPES.CUSTOMER_REVISION_REQUEST ||
              r.classification === "REVISION_REQUEST"
          ),
        };
        break;
      }

      case "unmatched_customer_replies": {
        const rows = await listRecentInboundReplies(80);
        result = { replies: rows.filter((r) => r.orderId == null) };
        break;
      }

      case "work_orders_ready": {
        result = { items: await listWorkOrdersReady(100) };
        break;
      }

      case "generate_work_order": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        const out = await generateWorkOrder(oid);
        if (out.ok === false) {
          result = { generated: false, blockers: out.blockers };
          break;
        }
        result = {
          generated: true,
          workOrderNumber: out.workOrderNumber,
          workOrder: out.packet,
        };
        break;
      }

      case "work_order_gate_check": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        const order = await loadOrderForWorkOrder(oid);
        if (!order) {
          return { ok: false, status: 404, error: "Order not found" };
        }
        result = isWorkOrderReady(order);
        break;
      }

      case "mark_work_order_printed": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        await markWorkOrderPrinted(oid);
        result = { printed: true, orderId: oid };
        break;
      }

      case "work_order_open_links": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = {
          printUrl: `/work-orders/${oid}/print`,
          apiUrl: `/api/work-orders/${oid}`,
        };
        break;
      }

      case "quote_calculate": {
        const d =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>)
            : {};
        const input: QuoteInput = {
          customerName:
            typeof d.customerName === "string" ? d.customerName : "",
          productType:
            typeof d.productType === "string" ? d.productType : "garment",
          quantity: Number(d.quantity),
          blankCost: Number(d.blankCost),
          productionMethod: String(d.productionMethod || "").trim(),
          frontColors:
            d.frontColors != null ? Number(d.frontColors) : undefined,
          backColors: d.backColors != null ? Number(d.backColors) : undefined,
          artNeeded: Boolean(d.artNeeded),
          rush: Boolean(d.rush),
          shippingCost:
            d.shippingCost != null ? Number(d.shippingCost) : undefined,
          notes: typeof d.notes === "string" ? d.notes : "",
        };
        const val = validateQuoteInput(input);
        if (val.ok === false) {
          return { ok: false, status: 400, error: val.error };
        }
        const quote = calculateQuote(input);
        result = {
          quote,
          squarePrep: buildSquareDraftFromQuote(quote, input),
        };
        break;
      }

      case "quote_rules": {
        result = { rules: QUOTE_RULES };
        break;
      }

      case "orders_needing_communication": {
        const [depositCandidates, digest] = await Promise.all([
          getOrdersNeedingDepositReminder(),
          getCustomerCommsDigest(),
        ]);
        result = {
          depositReminderCandidates: depositCandidates,
          digestSummary: digest.summaryLine,
          digestCounts: digest.counts,
        };
        break;
      }

      case "mark_proof_approved": {
        const oid = String(
          (data as Record<string, unknown> | undefined)?.orderId ?? ""
        ).trim();
        if (!oid) {
          return { ok: false, status: 400, error: "orderId is required" };
        }
        result = await approveProof(oid);
        break;
      }

      case "follow_up_estimates": {
        try {
          const fuData =
            typeof data === "object" && data !== null
              ? (data as Record<string, unknown>)
              : {};
          const sendSim = (fuData as { send?: unknown }).send === true;
          if (
            sendSim &&
            (fuData as { confirm?: unknown }).confirm !== true
          ) {
            return { ok: false, status: 400, error: "Confirmation required" };
          }

          const raw = await listDraftInvoicesForFollowup();
          const now = Date.now();

          const daysSince = (createdMs: number): number =>
            Math.floor((now - createdMs) / MS_DAY);

          const scorePriority = (ageDays: number, totalAmt: number): number => {
            let priority = 0;
            if (ageDays >= 3) priority += 1;
            if (ageDays >= 7) priority += 2;
            if (ageDays >= 10) priority += 3;
            if (totalAmt > 500) priority += 2;
            if (totalAmt > 1000) priority += 3;
            return priority;
          };

          const messageForPriority = (p: number, name: string): string => {
            const low =
              "Hey " +
              name +
              ", just checking in on your order — let me know if you'd like to move forward!";
            const medium =
              "Hey " +
              name +
              ", just following up on your shirts — we've got availability this week if you want to get started.";
            const high =
              "Hey " +
              name +
              ", just wanted to check one last time on your order — we can get this into production right away if you're ready.";
            if (p >= 5) return high;
            if (p >= 3) return medium;
            return low;
          };

          const recipientEmail = (inv: Record<string, unknown>): string => {
            const pick = (o: unknown): string => {
              if (!o || typeof o !== "object") return "";
              const r = o as Record<string, unknown>;
              const e = r.emailAddress ?? r.email_address ?? r.email;
              return typeof e === "string" ? e.trim() : "";
            };
            let s = pick(inv.primaryRecipient);
            if (s) return s;
            s = pick(inv.customer);
            if (s) return s;
            return "";
          };

          const rows = raw
            .map((inv) => (inv && typeof inv === "object" ? (inv as Record<string, unknown>) : null))
            .filter((inv): inv is Record<string, unknown> => inv !== null)
            .filter((inv) => {
              const st = String(inv.status ?? "").toUpperCase();
              if (st === "PAID" || st === "COMPLETED") return false;
              const createdAt = inv.createdAt ?? inv.updatedAt;
              const t = createdAt ? new Date(String(createdAt)).getTime() : NaN;
              return Number.isFinite(t);
            })
            .map((inv) => {
              const customerName = invoiceCustomerName(inv);
              const total =
                invoiceMoneyToTotal(inv.computedAmountMoney) ??
                invoiceMoneyToTotal(inv.documentAmountMoney) ??
                invoiceMoneyToTotal(inv.publicAmountMoney) ??
                0;
              const createdAt = inv.createdAt ?? inv.updatedAt;
              const createdMs = new Date(String(createdAt)).getTime();
              const ageDays = daysSince(createdMs);
              const priority = scorePriority(ageDays, total);
              const message = messageForPriority(priority, customerName);
              const addr = recipientEmail(inv);
              return {
                id: String(inv.id ?? ""),
                customerName,
                total,
                priority,
                message,
                email: addr || undefined,
                customerEmail: addr || undefined
              };
            });

          const totalOpenValue = rows.reduce((s, r) => s + r.total, 0);
          const totalCount = rows.length;
          const highPriorityCount = rows.filter((r) => r.priority >= 5).length;

          const sorted = [...rows].sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.total - a.total;
          });

          const estimates: Array<
            (typeof sorted)[number] & {
              sent: boolean;
              sentAt: string | null;
              error?: string;
            }
          > = [];

          for (const est of sorted) {
            let sent = false;
            let sentAt: string | null = null;
            let error: string | undefined;

            if (sendSim) {
              type EstRow = (typeof sorted)[number] & {
                email?: string;
                customerEmail?: string;
                message: string;
              };
              const eRow = est as EstRow;
              const message = eRow.message;

              const customerEmail = eRow.email || eRow.customerEmail;

              if (!customerEmail) {
                sent = false;
                error = "No email";
              } else {
                const liveSend = ["true", "1", "on", "yes"].includes(
                  String(process.env.CHEEKY_OPERATOR_RESEND_LIVE_SEND || "").trim().toLowerCase()
                );
                const fromAddr =
                  String(
                    process.env.RESEND_FROM ||
                      process.env.CHEEKY_RESEND_FROM_ORDERS ||
                      ""
                  ).trim() || "Cheeky Tees <orders@cheekytees.com>";

                try {
                  if (!liveSend) {
                    sent = false;
                    error = undefined;
                    sentAt = null;
                  } else {
                    const response = await fetch("https://api.resend.com/emails", {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        from: fromAddr,
                        to: [customerEmail],
                        subject: "Quick follow-up on your order",
                        html: `<p>${message}</p>`,
                      }),
                    });

                    const text = await response.text();

                    if (response.ok) {
                      sent = true;
                      sentAt = new Date().toISOString();
                    } else {
                      sent = false;
                      error = `Resend error: ${text}`;
                    }
                  }
                } catch (err) {
                  sent = false;
                  error =
                    err instanceof Error ? err.message : String(err);
                }
              }
            }

            estimates.push({
              ...est,
              sent,
              sentAt,
              ...(error !== undefined ? { error } : {})
            });
          }

          result = {
            summary: {
              totalOpenValue,
              totalCount,
              highPriorityCount
            },
            estimates
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, status: 500, error: message };
        }
        break;
      }

      default:
        return { ok: false, status: 400, error: "Invalid command" };
    }

    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Unknown error"
    };
  }
}

const router = express.Router();

router.post("/execute", async (req, res) => {
  try {
    const { command, data } = req.body ?? {};
    const out = await handleOperatorCommand({ command, data });

    if (out.ok === false) {
      return res.status(out.status).json({
        success: false,
        error: out.error
      });
    }

    return res.json({
      success: true,
      result: out.result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Server error"
    });
  }
});

router.get("/test-followup", async (_req, res) => {
  try {
    const out = await handleOperatorCommand({
      command: "follow_up_estimates",
      data: { send: true, confirm: true }
    });

    if (out.ok === false) {
      return res.status(out.status).json({
        success: false,
        error: out.error
      });
    }

    return res.json({
      success: true,
      result: out.result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Server error"
    });
  }
});

export default router;
