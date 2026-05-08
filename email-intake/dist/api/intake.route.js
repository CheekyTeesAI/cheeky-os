"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseCommand } = require("../../lib/commandParser");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runAutoIntake } = require("../../lib/autoIntake");
const router = express_1.default.Router();
router.post("/", async (req, res) => {
    try {
        const message = req.body?.message ?? req.body?.text ?? "";
        if (!message || String(message).trim() === "") {
            return res.status(400).json({ error: "Missing message" });
        }
        const parsed = parseCommand(String(message));
        const result = await runAutoIntake(parsed);
        return res.json({
            success: true,
            parsed,
            result,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({
            success: false,
            error: msg,
        });
    }
});
exports.default = router;
