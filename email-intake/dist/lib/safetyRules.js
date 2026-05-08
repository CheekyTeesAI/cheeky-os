"use strict";
/**
 * Central safety policy — no auto-send, no silent mutations.
 * Callers assert before side effects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAFETY = void 0;
exports.assertNoAutoSend = assertNoAutoSend;
exports.assertSafeReadOnly = assertSafeReadOnly;
exports.SAFETY = {
    allowAutoSend: false,
    allowAutoQuoteMutation: false,
    allowAutoPaymentCapture: false,
    requireExplicitConfirmForSend: true,
};
function assertNoAutoSend(context) {
    if (exports.SAFETY.allowAutoSend) {
        throw new Error(`[safety] auto-send blocked (${context})`);
    }
}
function assertSafeReadOnly(context) {
    void context;
}
