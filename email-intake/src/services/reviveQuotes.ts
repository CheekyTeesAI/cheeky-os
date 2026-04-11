import { db } from "../db/client";
import { logRevenueEvent } from "./revenueLogger";
import { runSalesAgentForOrder } from "./salesAgent";

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

/** In-memory: last revive run per order (no schema). Throttle to once / 24h per order. */
const lastReviveAt = new Map<string, number>();

/**
 * Finds QUOTE orders older than 24h and runs sales agent (generate-only, console).
 */
export async function runQuoteRevival(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TWENTY_FOUR_H_MS);
    const now = Date.now();

    const candidates = await db.order.findMany({
      where: { deletedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, status: true },
    });

    const stale = candidates.filter(
      (o) => String(o.status).toUpperCase() === "QUOTE"
    );

    logRevenueEvent(
      "SALES_REVIVE_RUN",
      "batch",
      `${stale.length} stale quote(s)`
    );

    for (const o of stale) {
      const prev = lastReviveAt.get(o.id);
      if (prev !== undefined && now - prev < TWENTY_FOUR_H_MS) {
        continue;
      }
      try {
        await runSalesAgentForOrder(o.id, {
          autoSend: false,
          channel: "console",
          reason: "revive",
        });
        lastReviveAt.set(o.id, now);
      } catch (e) {
        console.error("[reviveQuotes] order", o.id, e);
      }
    }
  } catch (err) {
    console.error("[reviveQuotes] runQuoteRevival", err);
  }
}

let revivalRegistered = false;

/** Idempotent: safe to call once from server bootstrap. */
export function registerQuoteRevivalInterval(): void {
  if (revivalRegistered) return;
  revivalRegistered = true;
  setInterval(() => {
    try {
      void runQuoteRevival();
    } catch (e) {
      console.error("[reviveQuotes] interval", e);
    }
  }, 60 * 60 * 1000);
}
