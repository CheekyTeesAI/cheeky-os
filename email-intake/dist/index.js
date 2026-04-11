"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJarvisApi = registerJarvisApi;
const jarvisRoutes_1 = __importDefault(require("./routes/jarvisRoutes"));
/**
 * Registers Jarvis operator API under /api/jarvis.
 * Auth: mount after global requireApiKey in voice.run.ts (no per-route key here).
 */
function registerJarvisApi(app) {
    app.use("/api/jarvis", jarvisRoutes_1.default);
}
