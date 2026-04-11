import type { JarvisIntent } from "./intentParser.service";

function countFromResult(result: unknown, key: string): number {
  if (!result || typeof result !== "object") return 0;
  const v = (result as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.length : 0;
}

function summaryForIntent(intent: JarvisIntent, result: unknown): string {
  if (intent === "RUN_BUSINESS") {
    const executed = countFromResult(result, "executed");
    return `Business scan complete. ${executed} owner actions executed.`;
  }
  if (intent === "SCHEDULE_DAY") {
    return "Schedule generated. Top jobs are queued for production.";
  }
  if (intent === "SYNC_BRAIN") {
    return "Brain synced. Note captured for follow-up.";
  }
  if (intent === "NEXT_ACTIONS") {
    const total = Array.isArray(result) ? result.length : 0;
    return `Top priorities ready. ${total} actions ranked.`;
  }
  if (intent === "SHOP_STATUS") {
    return "Shop status loaded. War room snapshot is ready.";
  }
  if (intent === "FOLLOW_UP_LEADS") {
    return "Follow-up run complete. Lead outreach updated.";
  }
  if (intent === "CLOSE_DEALS") {
    return "Close-deals plan ready. Priority deals are queued.";
  }
  if (intent === "REVIVE_PIPELINE") {
    return "Revive pipeline run complete. Stale deals prioritized.";
  }
  if (intent === "GENERATE_REVENUE") {
    return "Revenue generation plan built. Outbound actions prepared.";
  }
  return "Intent not recognized. Available commands returned.";
}

export function formatJarvisResponse(intent: JarvisIntent, result: unknown) {
  return {
    success: true,
    intent,
    summary: summaryForIntent(intent, result),
    data: result
  };
}
