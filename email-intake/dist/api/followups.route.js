"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFollowUps, markContacted } = require("../../lib/leadFollowUpEngine");
const router = express_1.default.Router();
router.get("/", (_req, res) => {
    try {
        res.json({ success: true, followUps: getFollowUps() });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.post("/contacted", (req, res) => {
    try {
        const id = req.body && req.body.id;
        if (!id) {
            return res.status(400).json({ success: false, error: "missing id" });
        }
        const updated = markContacted(String(id));
        if (!updated) {
            return res.status(404).json({ success: false, error: "lead not found" });
        }
        res.json({ success: true, updated });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
exports.default = router;
