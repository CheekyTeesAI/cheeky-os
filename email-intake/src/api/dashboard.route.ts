import express, { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getLeads } = require("../../lib/leadStore");

const router = express.Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    const leads = getLeads();

    res.json({
      success: true,
      metrics: {
        totalLeads: leads.length,
        newLeads: leads.filter((l: { status?: string }) => l.status === "new")
          .length,
        contacted: leads.filter(
          (l: { status?: string }) => l.status === "contacted"
        ).length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
