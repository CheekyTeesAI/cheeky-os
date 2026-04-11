import express, { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runFollowUpCycle } = require("../../lib/followUpEngine");

const router = express.Router();

router.post("/", async (_req: Request, res: Response) => {
  try {
    const result = await runFollowUpCycle();
    res.json({ success: true, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
