import express, { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  getTasks,
  updateTaskStage,
  updateTaskOwner,
  updateTaskPriority,
  completeTask,
  getTaskMetrics,
} = require("../../lib/taskStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getEvents } = require("../../lib/eventStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getIntake } = require("../../lib/intakeStore");

const router = express.Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      tasks: getTasks(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/update", (req: Request, res: Response) => {
  try {
    const { id, stage } = req.body as { id?: string; stage?: string };

    if (!id || !stage) {
      return res.status(400).json({ success: false, error: "missing id/stage" });
    }

    const updated = updateTaskStage(id, stage);

    if (!updated) {
      return res.status(404).json({ success: false, error: "task not found" });
    }

    res.json({ success: true, task: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/owner", (req: Request, res: Response) => {
  try {
    const { id, owner } = req.body as { id?: string; owner?: string };
    if (!id || owner === undefined || owner === null) {
      return res.status(400).json({ success: false, error: "missing id/owner" });
    }
    const updated = updateTaskOwner(id, String(owner));
    if (!updated) {
      return res.status(404).json({ success: false, error: "task not found" });
    }
    res.json({ success: true, task: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/priority", (req: Request, res: Response) => {
  try {
    const { id, priority } = req.body as { id?: string; priority?: string };
    if (!id || !priority) {
      return res.status(400).json({ success: false, error: "missing id/priority" });
    }
    const updated = updateTaskPriority(id, priority);
    if (!updated) {
      return res.status(404).json({ success: false, error: "task not found" });
    }
    res.json({ success: true, task: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/complete", (req: Request, res: Response) => {
  try {
    const { id } = req.body as { id?: string };
    if (!id) {
      return res.status(400).json({ success: false, error: "missing id" });
    }
    const updated = completeTask(id);
    if (!updated) {
      return res.status(404).json({ success: false, error: "task not found" });
    }
    res.json({ success: true, task: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.get("/metrics", (_req: Request, res: Response) => {
  try {
    const m = getTaskMetrics();
    res.json({ success: true, ...m });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.get("/events", (req: Request, res: Response) => {
  try {
    const raw = req.query.limit;
    const limit =
      typeof raw === "string" && raw ? Math.min(200, parseInt(raw, 10) || 100) : 100;
    res.json({ success: true, events: getEvents(limit) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.get("/intake", (req: Request, res: Response) => {
  try {
    const raw = req.query.limit;
    const limit =
      typeof raw === "string" && raw ? Math.min(200, parseInt(raw, 10) || 100) : 100;
    res.json({ success: true, intake: getIntake(limit) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
