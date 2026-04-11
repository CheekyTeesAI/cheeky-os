/**
 * Lightweight console-only logger (no external transports).
 * Distinct from utils/logger.ts (Winston) — use this for minimal dependency paths.
 */

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  if (meta !== undefined) {
    console.log(`[INFO] ${message}`, meta);
    return;
  }
  console.log(`[INFO] ${message}`);
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  if (meta !== undefined) {
    console.error(`[ERROR] ${message}`, meta);
    return;
  }
  console.error(`[ERROR] ${message}`);
}
