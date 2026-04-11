"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAFETY = void 0;
exports.SAFETY = {
    SYSTEM_DISABLED: process.env.SYSTEM_DISABLED === "true",
    USE_MOCK: process.env.USE_MOCK === "true"
};
