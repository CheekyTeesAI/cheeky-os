"use strict";

/**
 * Square webhook — legacy JSON routes + CANONICAL raw HMAC routes.
 * v1.2 lock: POST /api/square/webhook and POST /webhooks/square/webhook
 * both verify HMAC (when key set) and run dist processSquareWebhook + cash loop.
 */

const express = require("express");
const path = require("path");

// Square Sync handoff — safe, non-blocking, additive only
let _squareSyncService = null;
function getSquareSyncService() {
  if (_squareSyncService) return _squareSyncService;
  try {
    _squareSyncService = require(path.join(
      __dirname,
      "..",
      "..",
      "squareSync",
      "squareSync.service"
    ));
  } catch (_) {}
  return _squareSyncService;
}

async function fireSyncHandoff(event) {
  try {
    const svc = getSquareSyncService();
    if (svc && typeof svc.handleSquareWebhookEvent === "function") {
      await svc.handleSquareWebhookEvent(event);
    }
  } catch (err) {
    console.error(
      "[squareWebhook] Square sync handoff failed:",
      err && err.message ? err.message : err
    );
  }
}

const distSvcPath = path.join(
  __dirname,
  "..",
  "..",
  "dist",
  "services",
  "squareWebhookService"
);
const loopPath = path.join(
  __dirname,
  "..",
  "..",
  "cheeky-os",
  "services",
  "cashToOrder.loop.service"
);

const ctSyncPath = path.join(
  __dirname,
  "..",
  "..",
  "cheeky-os",
  "services",
  "ctSync.service"
);

/**
 * Same internal steps as POST /webhooks/square/webhook (HTTP signature verify is separate).
 * Used by simulation scripts; implements the canonical cash→order pipeline.
 */
async function runCanonicalSquareWebhookPipeline(payload, routeLabel) {
  let sw;
  try {
    sw = require(distSvcPath);
  } catch (reqErr) {
    throw new Error(
      "webhook_engine_unavailable: " +
        (reqErr && reqErr.message ? reqErr.message : String(reqErr))
    );
  }

  const et = sw.extractEventType(payload) || "unknown";
  const paymentTriggers = [
    "invoice.payment_made",
    "payment.updated",
    "invoice.updated",
  ];

  let ctSync = null;
  try {
    ctSync = require(ctSyncPath);
  } catch (_) {
    ctSync = null;
  }
  if (
    ctSync &&
    typeof ctSync.assertIntakeQueueGate === "function" &&
    paymentTriggers.includes(et)
  ) {
    const gate = await ctSync.assertIntakeQueueGate(payload);
    if (!gate.ok) {
      const reason = gate.reason || "ct_intake_gate_rejected";
      console.warn(
        "[square-webhook] CT_INTAKE_GATE_REJECTED route=" +
          routeLabel +
          " code=" +
          (gate.code || "") +
          " " +
          String(reason).slice(0, 220)
      );
      return {
        result: {
          success: false,
          message: reason,
          ctGateRejected: true,
          ctGateCode: gate.code || null,
        },
      };
    }
  }

  if (paymentTriggers.includes(et)) {
    console.log(
      "[cash-to-order] PAYMENT_TRIGGER_EXECUTED eventType=" + et + " route=" + routeLabel
    );
  }

  let loop;
  try {
    loop = require(loopPath);
  } catch (_) {
    loop = null;
  }
  const extract =
    loop && typeof loop.extractPaymentData === "function"
      ? loop.extractPaymentData(payload)
      : {};

  const result = await sw.processSquareWebhook(payload);

  try {
    const sf = require(path.join(
      __dirname,
      "..",
      "..",
      "cheeky-os",
      "services",
      "selfFixService"
    ));
    if (!result.success) {
      const low = String(result.message || "").toLowerCase();
      if (low.includes("no matching order")) {
        sf.captureWebhookFailure(routeLabel, new Error(result.message || "no_match"), {});
        sf.attemptAutoFix(
          sf.normalizeIssue({
            type: "webhook_no_order",
            source: `webhook:${routeLabel}`,
            error: new Error(result.message || "no_match"),
          })
        );
      } else {
        sf.captureWebhookFailure(routeLabel, new Error(result.message || "webhook_failed"), {
          orderId: result.orderId,
        });
      }
    }
  } catch (_) {
    /* self-fix optional */
  }

  if (
    !result.success &&
    String(result.message || "").toLowerCase().includes("no matching order")
  ) {
    const strict =
      ctSync &&
      typeof ctSync.isStrictGateEnabled === "function" &&
      ctSync.isStrictGateEnabled();
    if (!strict && loop && typeof loop.tryEnsureOrderAfterWebhookNoMatch === "function") {
      await loop.tryEnsureOrderAfterWebhookNoMatch(payload, extract);
    } else if (strict) {
      console.log(
        "[cash-to-order] tryEnsureOrderAfterWebhookNoMatch skipped (CHEEKY_CT_INTAKE_GATE_STRICT)"
      );
    }
  } else if (
    result.success &&
    result.orderId &&
    result.message !== "already processed"
  ) {
    console.log("[square-webhook] matched order orderId=" + result.orderId);
    if (loop && typeof loop.afterOrderPaymentHook === "function") {
      await loop.afterOrderPaymentHook(result.orderId, payload);
    }
    try {
      const prismaSnap = require(path.join(__dirname, "..", "lib", "prisma"));
      const o = await prismaSnap.order.findFirst({
        where: { id: result.orderId, deletedAt: null },
        select: {
          depositPaidAt: true,
          status: true,
          garmentsOrdered: true,
        },
      });
      if (o && o.depositPaidAt) {
        console.log("[flow] CASH GATE PASSED orderId=" + result.orderId);
      }
      const st = String((o && o.status) || "").toUpperCase();
      if (st === "PRODUCTION_READY") {
        console.log("[flow] PRODUCTION READY orderId=" + result.orderId);
      }
      if (o && o.garmentsOrdered === true) {
        console.log("[flow] GARMENT ORDER CREATED orderId=" + result.orderId);
      }
    } catch (snapErr) {
      console.warn(
        "[square-webhook] post_match snapshot skipped:",
        snapErr && snapErr.message ? snapErr.message : snapErr
      );
    }

    if (
      ctSync &&
      typeof ctSync.mirrorDepositToDataverse === "function" &&
      result.message !== "already processed"
    ) {
      try {
        await ctSync.mirrorDepositToDataverse(result.orderId);
      } catch (mirErr) {
        console.warn(
          "[square-webhook] ctSync mirrorDepositToDataverse:",
          mirErr && mirErr.message ? mirErr.message : mirErr
        );
      }
    }
  }

  fireSyncHandoff(payload).catch(() => {});

  return { result };
}

const router = express.Router();

function resolveNotificationUrl(req) {
  const explicit = (process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || "").trim();
  if (explicit) {
    return explicit.replace(/\?.*$/, "").replace(/\/+$/, "");
  }
  const protoRaw = String(
    req.headers["x-forwarded-proto"] || req.protocol || "https"
  );
  const proto = protoRaw.split(",")[0].trim();
  const hostRaw = String(
    req.headers["x-forwarded-host"] || req.headers.host || ""
  );
  const host = hostRaw.split(",")[0].trim();
  const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
  return `${proto}://${host}${pathOnly}`;
}

/**
 * Mount the canonical raw-body Square webhook route BEFORE express.json().
 */
function mountCanonicalInvoiceRaw(app) {
  console.log(
    "[square-webhook] WEBHOOK_CANONICAL_ACTIVE POST /api/square/webhook + POST /webhooks/square/webhook (v1.2 processSquareWebhook + loop)"
  );

  function makeHandler(routeLabel) {
    return async function handleCanonicalSquareWebhook(req, res) {
      try {
        const rawBuf = req.body && Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        const rawStr = rawBuf.toString("utf8");
        if (!rawStr.trim()) {
          return res.status(400).json({ ok: false, error: "empty_body" });
        }

        let sw;
        try {
          sw = require(distSvcPath);
        } catch (reqErr) {
          console.error(
            "[square-webhook] dist service load failed:",
            reqErr && reqErr.message ? reqErr.message : reqErr
          );
          return res.status(500).json({ ok: false, error: "webhook_engine_unavailable" });
        }

        const sig = req.headers["x-square-hmacsha256-signature"];
        try {
          sw.verifySquareSignature(rawStr, sig, resolveNotificationUrl(req));
        } catch (verErr) {
          const msg =
            verErr && verErr.message ? String(verErr.message) : String(verErr);
          const unauthorized =
            msg.includes("signature") || msg.includes("missing x-square");
          console.warn(
            "[WEBHOOK][SECURITY][FAIL] square_webhook_verify route=" +
              routeLabel +
              " unauthorized=" +
              String(unauthorized) +
              " detail=" +
              msg.slice(0, 220)
          );
          console.warn(
            "[square-webhook] verify_reject route=" +
              routeLabel +
              " " +
              msg.slice(0, 160)
          );
          return res.status(unauthorized ? 401 : 400).json({ ok: false, error: msg });
        }

        let payload;
        try {
          payload = JSON.parse(rawStr);
        } catch (_) {
          return res.status(400).json({ ok: false, error: "invalid_json" });
        }

        const { result } = await runCanonicalSquareWebhookPipeline(
          payload,
          routeLabel + " [same_pipeline_as_canonical=/webhooks/square/webhook]"
        );

        if (result.success) {
          return res.status(200).json({ ok: true, result });
        }
        return res.status(200).json({ ok: false, error: result.message });
      } catch (err) {
        console.error(
          "[square-webhook] canonical error:",
          err && err.stack ? err.stack : err
        );
        return res
          .status(500)
          .json({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    };
  }

  /* Logical canonical path per launch playbook: POST /webhooks/square/webhook — POST /api/square/webhook uses identical pipeline (alias). */
  app.post(
    "/api/square/webhook",
    express.raw({ type: "*/*", limit: "2mb" }),
    makeHandler("api/square/webhook")
  );

  app.post(
    "/webhooks/square/webhook",
    express.raw({ type: "*/*", limit: "2mb" }),
    makeHandler("webhooks/square/webhook")
  );
}

router.post("/square", express.json(), (req, res) => {
  const body = req.body || {};
  const type = body.type || body.event_type || "unknown";
  console.log("[squareWebhook] legacy POST /square event:", type);
  return res.json({ ok: true, received: true, type });
});

router.post("/square/payment", express.json(), (req, res) => {
  console.log("[squareWebhook] payment event");
  return res.json({ ok: true, received: true });
});

module.exports = router;
module.exports.mountCanonicalInvoiceRaw = mountCanonicalInvoiceRaw;
module.exports.runCanonicalSquareWebhookPipeline = runCanonicalSquareWebhookPipeline;
