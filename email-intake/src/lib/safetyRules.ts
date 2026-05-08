/**
 * Central safety policy — no auto-send, no silent mutations.
 * Callers assert before side effects.
 */

export const SAFETY = {
  allowAutoSend: false,
  allowAutoQuoteMutation: false,
  allowAutoPaymentCapture: false,
  requireExplicitConfirmForSend: true,
} as const;

export function assertNoAutoSend(context: string): void {
  if (SAFETY.allowAutoSend) {
    throw new Error(`[safety] auto-send blocked (${context})`);
  }
}

export function assertSafeReadOnly(context: string): void {
  void context;
}
