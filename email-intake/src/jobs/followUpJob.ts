import { runFollowUps } from "../services/followUpEngine";

export async function runFollowUpJob(): Promise<void> {
  try {
    await runFollowUps();
  } catch (err) {
    console.error("[followUpJob]", err instanceof Error ? err.message : err);
  }
}
