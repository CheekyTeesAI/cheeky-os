"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stepLog = exports.logger = void 0;
const winston_1 = require("winston");
exports.logger = (0, winston_1.createLogger)({
    level: "info",
    format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.json()),
    transports: [
        new winston_1.transports.Console({
            format: winston_1.format.combine(winston_1.format.colorize(), winston_1.format.printf(({ level, message }) => `${level}: ${message}`))
        })
    ]
});
/** Plain console traces for major pipeline stages (visibility / debugging). */
exports.stepLog = {
    brain: (detail) => console.log("[brain]", detail),
    gatekeeper: (detail) => console.log("[gatekeeper]", detail),
    router: (detail) => console.log("[router]", detail),
    engine: (detail) => console.log("[engine]", detail)
};
