import { Request, Response, Router } from "express";
import { getLastRun } from "../debug/store";
import { readExpectedApiKey, readProvidedApiKey } from "../middleware/auth";

const router = Router();

router.get("/cheeky/debug/last", (req: Request, res: Response) => {
  const provided = readProvidedApiKey(req);
  const expected = readExpectedApiKey();
  if (!provided || provided !== expected) {
    res.status(401).json({
      ok: false,
      success: false,
      stage: "auth",
      error: "Invalid API key"
    });
    return;
  }
  res.json({ lastRun: getLastRun() });
});

export default router;
