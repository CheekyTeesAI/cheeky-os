"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
function successResponse(data, message) {
    return {
        success: true,
        message,
        data
    };
}
function errorResponse(message, errors) {
    return {
        success: false,
        message,
        errors
    };
}
