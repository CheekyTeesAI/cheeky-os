import express, { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseCommand } = require("../../lib/commandParser");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runAutoIntake } = require("../../lib/autoIntake");

const router = express.Router();

router.post("/", async (req: Request, res: Response) => {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      error: msg,
    });
  }
});

export default router;
