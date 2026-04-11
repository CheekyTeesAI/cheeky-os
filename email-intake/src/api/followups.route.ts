import express, { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFollowUps, markContacted } = require("../../lib/leadFollowUpEngine");

const router = express.Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    res.json({ success: true, followUps: getFollowUps() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/contacted", (req: Request, res: Response) => {
  try {
    const id = req.body && (req.body as { id?: string }).id;
    if (!id) {
      return res.status(400).json({ success: false, error: "missing id" });
    }
    const updated = markContacted(String(id));
    if (!updated) {
      return res.status(404).json({ success: false, error: "lead not found" });
    }
    res.json({ success: true, updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
