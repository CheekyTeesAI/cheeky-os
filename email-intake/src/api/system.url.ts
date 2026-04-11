import { Request, Response, Router } from "express";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const proto = String(req.headers["x-forwarded-proto"] || "http");
  const host = String(req.headers.host || "localhost");
  const baseUrl = `${proto}://${host}`;
  res.json({
    baseUrl,
    webhookUrl: `${baseUrl}/cheeky/webhooks/square`
  });
});

export default router;
