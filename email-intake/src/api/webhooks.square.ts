console.log("🪝 WEBHOOK FILE LOADED");
import { Request, Response, Router } from "express";
import { brain } from "../core/brain";
import { gatekeeper } from "../core/gatekeeper";
import { route } from "../core/router";

const router = Router();

function logWebhookHit(req: Request): void {
  const proto = String(req.headers["x-forwarded-proto"] || "http");
  const host = String(req.headers.host || "localhost");
  const detectedUrl = `${proto}://${host}`;
  console.log("🔥🔥 WEBHOOK HIT 🔥🔥", new Date().toISOString());
  console.log("🌐 BASE URL:", detectedUrl);
}

router.get("/", (req: Request, res: Response) => {
  logWebhookHit(req);
  res.status(200).json({ received: true });
});

router.post("/", async (req: Request, res: Response) => {
  console.log("🔥🔥🔥 INSIDE POST ROUTE 🔥🔥🔥");

  const body = req.body as {
    type?: string;
    data?: {
      id?: string;
      object?: {
        payment?: { id?: string; status?: string };
        invoice?: { id?: string };
      };
    };
  };

  const eventType = String(body?.type ?? "unknown");
  const payment = body?.data?.object?.payment;
  const paymentStatus = payment?.status ? String(payment.status).toUpperCase() : "";
  const idHint =
    body?.data?.object?.invoice?.id ??
    payment?.id ??
    body?.data?.id ??
    "no-id";

  console.log("EVENT TYPE:", eventType, "| payment.status:", payment?.status ?? "(none)");

  const isCompletedPayment =
    eventType === "payment.updated" && paymentStatus === "COMPLETED";

  if (isCompletedPayment) {
    const pipelineInput = `Square payment.updated COMPLETED. Payment/invoice id: ${idHint}`;
    try {
      const brainOut = await brain(pipelineInput);
      const gk = gatekeeper(brainOut);
      if (gk.ok === false) {
        console.log("[WEBHOOK→PIPELINE] gatekeeper blocked:", gk.error);
      } else {
        const routed = await route(brainOut.intent, gk.payload);
        console.log(
          "[WEBHOOK→PIPELINE] invoiceId=",
          routed.invoiceId,
          "status=",
          routed.status
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[WEBHOOK→PIPELINE] error:", msg);
    }
  } else {
    console.log(
      "[WEBHOOK] Ignored (need payment.updated + COMPLETED):",
      eventType
    );
  }

  res.status(200).json({ received: true });
});

export default router;
