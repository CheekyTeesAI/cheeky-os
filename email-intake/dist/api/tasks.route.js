"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getTasks, updateTaskStage, updateTaskOwner, updateTaskPriority, completeTask, getTaskMetrics, } = require("../../lib/taskStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getEvents } = require("../../lib/eventStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getIntake } = require("../../lib/intakeStore");
const router = express_1.default.Router();
router.get("/", (_req, res) => {
    try {
        res.json({
            success: true,
            tasks: getTasks(),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.post("/update", (req, res) => {
    try {
        const { id, stage } = req.body;
        if (!id || !stage) {
            return res.status(400).json({ success: false, error: "missing id/stage" });
        }
        const updated = updateTaskStage(id, stage);
        if (!updated) {
            return res.status(404).json({ success: false, error: "task not found" });
        }
        res.json({ success: true, task: updated });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.post("/owner", (req, res) => {
    try {
        const { id, owner } = req.body;
        if (!id || owner === undefined || owner === null) {
            return res.status(400).json({ success: false, error: "missing id/owner" });
        }
        const updated = updateTaskOwner(id, String(owner));
        if (!updated) {
            return res.status(404).json({ success: false, error: "task not found" });
        }
        res.json({ success: true, task: updated });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.post("/priority", (req, res) => {
    try {
        const { id, priority } = req.body;
        if (!id || !priority) {
            return res.status(400).json({ success: false, error: "missing id/priority" });
        }
        const updated = updateTaskPriority(id, priority);
        if (!updated) {
            return res.status(404).json({ success: false, error: "task not found" });
        }
        res.json({ success: true, task: updated });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.post("/complete", (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, error: "missing id" });
        }
        const updated = completeTask(id);
        if (!updated) {
            return res.status(404).json({ success: false, error: "task not found" });
        }
        res.json({ success: true, task: updated });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.get("/metrics", (_req, res) => {
    try {
        const m = getTaskMetrics();
        res.json({ success: true, ...m });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.get("/events", (req, res) => {
    try {
        const raw = req.query.limit;
        const limit = typeof raw === "string" && raw ? Math.min(200, parseInt(raw, 10) || 100) : 100;
        res.json({ success: true, events: getEvents(limit) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.get("/intake", (req, res) => {
    try {
        const raw = req.query.limit;
        const limit = typeof raw === "string" && raw ? Math.min(200, parseInt(raw, 10) || 100) : 100;
        res.json({ success: true, intake: getIntake(limit) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
exports.default = router;
