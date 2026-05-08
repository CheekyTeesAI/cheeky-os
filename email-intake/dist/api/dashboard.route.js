"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getLeads } = require("../../lib/leadStore");
const router = express_1.default.Router();
router.get("/", (_req, res) => {
    try {
        const leads = getLeads();
        res.json({
            success: true,
            metrics: {
                totalLeads: leads.length,
                newLeads: leads.filter((l) => l.status === "new")
                    .length,
                contacted: leads.filter((l) => l.status === "contacted").length,
            },
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
exports.default = router;
