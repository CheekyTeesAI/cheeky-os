"use strict";
/**
 * Global priority — merges typed scores into one ranked list (read-only).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankGlobalPriority = rankGlobalPriority;
/**
 * Single ranked output: higher score first, stable tie-break by id.
 */
function rankGlobalPriority(items) {
    const copy = [...items];
    copy.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        return a.id.localeCompare(b.id);
    });
    return copy;
}
