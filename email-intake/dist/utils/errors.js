"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorResponse = errorResponse;
function errorResponse(stage, error) {
    return { ok: false, stage, error };
}
