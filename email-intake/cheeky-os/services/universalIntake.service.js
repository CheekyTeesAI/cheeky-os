"use strict";

/**
 * CHEEKY OS v3.5 — Universal Dataverse intake (POST /api/intake when body matches v3.5 contract).
 * Dispatched from src/routes/intake.js so legacy website POST /api/intake stays intact.
 */

const crypto = require("crypto");
const path = require("path");

const dvStore = require(path.join(__dirname, "..", "data", "dataverse-store"));
const ctSync = require(path.join(__dirname, "ctSync.service"));
const { logger } = require(path.join(__dirname, "..", "utils", "logger"));
const { scheduleIntakeBrainIfEnabled } = require(path.join(
  __dirname,
  "cheekyIntakeBrain.service"
));
const dvF = require(path.join(__dirname, "dvPublisherColumns.service"));

const INTAKE_ENTITY = () => dvF.intakeEntitySet();

function odataQuote(str) {
  return `'${String(str || "").replace(/'/g, "''")}'`;
}

function hourBucketIso() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function idempotencyToken(customerName, requestText) {
  const h = crypto
    .createHash("sha256")
    .update(
      `${String(customerName).trim()}|${String(requestText).trim()}|${hourBucketIso()}`,
      "utf8"
    )
    .digest("hex");
  return h.slice(0, 32);
}

function mapSourceToChannel(source) {
  const s = String(source || "").toLowerCase();
  if (s.includes("email")) return "EMAIL";
  if (s.includes("web")) return "WEB";
  if (s.includes("phone") || s.includes("voice")) return "PHONE";
  if (s.includes("power") || s.includes("apps")) return "POWER_APPS";
  return "OTHER";
}

function buildName(customer, source) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${String(customer).slice(0, 120)} | ${String(source).slice(0, 40)} | ${stamp}`;
  return base.slice(0, 300);
}

function buildRawPayload(requestText, meta) {
  const prefix = JSON.stringify(meta);
  const max = 4000;
  const rest = max - prefix.length - 1;
  const body = rest > 0 ? String(requestText).slice(0, rest) : "";
  return `${prefix}\n${body}`.slice(0, max);
}

function pickIntakeId(row) {
  return dvF.pickIntakeRowId(row);
}

function missingDvProperty(errorText) {
  const msg = String(errorText || "");
  const m = msg.match(/Could not find a property named '([^']+)'/i);
  return m && m[1] ? String(m[1]).trim() : "";
}

/**
 * True when body is the v3.5 universal contract (not the legacy web form).
 * Requires request_text/requestText + source so legacy CHEEKY_createIntakeOrder is unaffected.
 */
function isUniversalIntakeBody(body) {
  if (!body || typeof body !== "object") return false;
  const rt =
    body.request_text != null
      ? String(body.request_text).trim()
      : body.requestText != null
        ? String(body.requestText).trim()
        : "";
  const src = body.source != null ? String(body.source).trim() : "";
  const cn =
    body.customer_name != null
      ? String(body.customer_name).trim()
      : body.customerName != null
        ? String(body.customerName).trim()
        : "";
  return Boolean(rt && src && cn);
}

async function findExistingByIdempotency(token) {
  const gt = dvF.intakeField("gate_token");
  const filter = `${gt} eq ${odataQuote(token)}`;
  const selectCols = [dvF.intakePkCol(), dvF.intakeField("status")];
  const mkPath = () =>
    `${INTAKE_ENTITY()}?$filter=${encodeURIComponent(filter)}&$select=${selectCols.join(",")}&$top=1`;
  let pathQ = mkPath();
  let res = await dvStore.odataRequest("GET", pathQ, null, null, { timeoutMs: 20000 });
  if (!res.ok) {
    const bad = missingDvProperty(res.error || "");
    if (bad && selectCols.includes(bad) && selectCols.length > 1) {
      const next = selectCols.filter((c) => c !== bad);
      selectCols.length = 0;
      next.forEach((c) => selectCols.push(c));
      pathQ = mkPath();
      res = await dvStore.odataRequest("GET", pathQ, null, null, { timeoutMs: 20000 });
    }
  }
  if (!res.ok) {
    /**
     * Boot-stability behavior: missing Dataverse columns should not block intake create.
     * We treat lookup as "not found" and continue; duplicate safety becomes best-effort.
     */
    if (missingDvProperty(res.error || "")) {
      logger.warn(
        `[universalIntake] idempotency lookup degraded (missing DV column). Continuing create path safely. detail=${String(
          res.error || ""
        ).slice(0, 280)}`
      );
      return { ok: true, row: null, error: null, degraded: true };
    }
    return {
      ok: false,
      row: null,
      error: res.error || "odata_get_failed",
      odataPath: `GET .../${pathQ}`,
    };
  }
  const rows = (res.data && res.data.value) || [];
  return { ok: true, row: rows[0] || null, error: null };
}

async function createIntakeRecord({
  name,
  channel,
  customerName,
  requestText,
  source,
  idempKey,
  syncedAt,
}) {
  const meta = {
    v: "3.5",
    next_action: "AI parse required",
    priority: "normal",
    blocked_reason: null,
    source,
    ai_summary: null,
    ai_json: null,
    last_synced_at: syncedAt,
  };
  const body = {
    [dvF.intakeField("name")]: name,
    [dvF.intakeField("channel")]: channel,
    [dvF.intakeField("status")]: "INTAKE_NEW",
    [dvF.intakeField("customer_name")]: String(customerName).slice(0, 200),
    [dvF.intakeField("deposit_paid")]: false,
    [dvF.intakeField("gate_token")]: idempKey.slice(0, 64),
    [dvF.intakeField("raw_payload")]: buildRawPayload(requestText, meta),
  };

  const headers = { Prefer: "return=representation" };
  let res = await dvStore.odataRequest("POST", INTAKE_ENTITY(), body, headers, { timeoutMs: 25000 });
  if (!res.ok) {
    const bad = missingDvProperty(res.error || "");
    if (bad && Object.prototype.hasOwnProperty.call(body, bad)) {
      const retryBody = Object.assign({}, body);
      delete retryBody[bad];
      logger.warn(
        `[universalIntake] create retry without unsupported DV field ${bad} (schema drift tolerant mode)`
      );
      res = await dvStore.odataRequest("POST", INTAKE_ENTITY(), retryBody, headers, { timeoutMs: 25000 });
    }
  }

  let id = null;
  if (res.ok && res.data && pickIntakeId(res.data)) {
    id = pickIntakeId(res.data);
  }
  if (res.ok && !id) {
    const again = await findExistingByIdempotency(idempKey);
    if (again.ok && again.row) id = pickIntakeId(again.row);
  }
  return { ok: res.ok, id, error: res.ok ? null : res.error || "intake_post_failed" };
}

/**
 * If request matches v3.5 universal intake, write Dataverse + audit and send response.
 * @returns {Promise<boolean>} true if this handler owned the request
 */
async function tryHandleUniversalPost(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!isUniversalIntakeBody(body)) {
    return false;
  }

  const customerName =
    body.customer_name != null
      ? String(body.customer_name).trim()
      : String(body.customerName).trim();
  const requestText =
    body.request_text != null
      ? String(body.request_text).trim()
      : String(body.requestText).trim();
  const source = String(body.source).trim();

  if (!dvStore.isConfigured()) {
    logger.error("[universalIntake] Dataverse not configured (DATAVERSE_* env)");
    res.status(503).json({
      ok: false,
      error: "SYSTEM_ERROR",
      code: "dataverse_not_configured",
    });
    return true;
  }

  const idempKey = idempotencyToken(customerName, requestText);
  const channel = mapSourceToChannel(source);
  const syncedAt = new Date().toISOString();

  try {
    const existing = await findExistingByIdempotency(idempKey);
    if (!existing.ok) {
      logger.error(
        "[universalIntake] idempotency lookup failed (verify CHEEKY_DV_INTAKE_GATE_TOKEN_* / intake column envs match Maker): " +
          (existing.error || "") +
          (existing.odataPath ? " | " + existing.odataPath : "")
      );
      res.status(502).json({
        ok: false,
        error: "SYSTEM_ERROR",
        code: "dataverse_lookup_failed",
        detail: existing.error,
      });
      return true;
    }

    if (existing.row) {
      const intakeId = pickIntakeId(existing.row);
      try {
        require("./cheekyOsRuntimeObservability.service").noteRecentUniversalIntake({
          intakeId,
          customer: customerName,
          source,
          duplicate: true,
        });
      } catch (_) {}
      try {
        await require("./cheekyOsIntakeHooks.service").runUniversalIntakeAfterCreate({
          intakeId,
          duplicate: true,
          body,
        });
      } catch (_) {}
      res.status(200).json({
        ok: true,
        intake_id: intakeId,
        status: "NEW",
        duplicate: true,
      });
      return true;
    }

    const name = buildName(customerName, source);
    const created = await createIntakeRecord({
      name,
      channel,
      customerName,
      requestText,
      source,
      idempKey,
      syncedAt,
    });

    if (!created.ok || !created.id) {
      logger.error("[universalIntake] intake create failed: " + (created.error || "unknown"));
      await ctSync
        .writeAuditEvent({
          name: "INTAKE_CREATE_FAIL",
          message: String(created.error || "intake_post_failed"),
          eventType: "NODE_SYNC",
          severity: "HIGH",
          actor: "system:universalIntake",
          payloadJson: JSON.stringify({ customerName, source, idempKey }),
        })
        .catch(() => {});
      res.status(502).json({
        ok: false,
        error: "SYSTEM_ERROR",
        code: "dataverse_write_failed",
        detail: created.error,
      });
      return true;
    }

    const intakeId = created.id;

    await ctSync
      .writeAuditEvent({
        name: "INTAKE_CREATED",
        message: "event_type=INTAKE_CREATED universal intake",
        eventType: "NODE_SYNC",
        severity: "INFO",
        actor: "system:universalIntake",
        relatedIntakeId: intakeId,
        payloadJson: JSON.stringify({
          intake_id: intakeId,
          source,
          idempotency: idempKey,
        }),
      })
      .catch(() => {});

    scheduleIntakeBrainIfEnabled(intakeId);

    try {
      require(path.join(__dirname, "cheekyOsRuntimeObservability.service")).recordIntakeAccepted();
    } catch (_) {}
    try {
      require("./cheekyOsRuntimeObservability.service").noteRecentUniversalIntake({
        intakeId,
        customer: customerName,
        source,
        duplicate: false,
      });
    } catch (_) {}

    try {
      await require("./cheekyOsIntakeHooks.service").runUniversalIntakeAfterCreate({
        intakeId,
        duplicate: false,
        body,
      });
    } catch (_) {}

    res.status(200).json({
      ok: true,
      intake_id: intakeId,
      status: "NEW",
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[universalIntake] " + msg);
    res.status(500).json({
      ok: false,
      error: "SYSTEM_ERROR",
      code: "unexpected",
      detail: msg,
    });
    return true;
  }
}

module.exports = {
  isUniversalIntakeBody,
  tryHandleUniversalPost,
};
