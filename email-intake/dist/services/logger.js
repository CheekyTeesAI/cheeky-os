"use strict";
/**
 * Lightweight console-only logger (no external transports).
 * Distinct from utils/logger.ts (Winston) — use this for minimal dependency paths.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInfo = logInfo;
exports.logError = logError;
function logInfo(message, meta) {
    if (meta !== undefined) {
        console.log(`[INFO] ${message}`, meta);
        return;
    }
    console.log(`[INFO] ${message}`);
}
function logError(message, meta) {
    if (meta !== undefined) {
        console.error(`[ERROR] ${message}`, meta);
        return;
    }
    console.error(`[ERROR] ${message}`);
}
