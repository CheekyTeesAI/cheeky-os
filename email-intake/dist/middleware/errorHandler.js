"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../services/logger");
const errors_1 = require("../utils/errors");
function errorHandler(err, req, res, next) {
    (0, logger_1.logError)("express.unhandled", {
        message: err.message,
        path: req.originalUrl,
        method: req.method,
    });
    res.status(500).json((0, errors_1.errorResponse)("UNHANDLED", err.message || "Unknown error"));
}
