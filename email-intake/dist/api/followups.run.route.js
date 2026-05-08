"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runFollowUpCycle } = require("../../lib/followUpEngine");
const router = express_1.default.Router();
router.post("/", async (_req, res) => {
    try {
        const result = await runFollowUpCycle();
        res.json({ success: true, result });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
exports.default = router;
