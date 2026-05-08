"use strict";

/**
 * CHEEKY OS Phase 1 — POST /api/intake Dataverse branch (additive).
 *
 * OData entity sets (defaults; override via env):
 *   CHEEKY_CT_INTAKE_ENTITY_SET  → ct_intake_queues
 *   CHEEKY_CT_AUDIT_ENTITY_SET   → ct_audit_events
 *
 * Uses dvStore.odataRequest (same stack as ctSync + universal intake + ct_orderses).
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

/** Allowed `source` values (lowercase request); mapped to Dataverse ct_channel choice. */
const SOURCE_ALIASES = {
  web: "WEB",
  email: "EMAIL",
  phone: "PHONE",
  voice: "PHONE",
  manual: "OTHER",
  powerapps: "POWER_APPS",
};

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

function pickStr(body, snake, camel) {
  const a = body[snake];
  const b = body[camel];
  const raw = a != null ? String(a).trim() : b != null ? String(b).trim() : "";
  return raw;
}

function pickIntakeId(row) {
  return dvF.pickIntakeRowId(row);
}

function idempotencyToken(customerName, contactInfo, requestText, metadata) {
  let metaJson = "{}";
  try {
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const sorted = {};
      for (const k of Object.keys(metadata).sort()) sorted[k] = metadata[k];
      metaJson = JSON.stringify(sorted);
    }
  } catch (_) {
    metaJson = "{}";
  }
  const h = crypto
    .createHash("sha256")
    .update(
      `${String(customerName).trim()}|${String(contactInfo).trim()}|${String(requestText).trim()}|${hourBucketIso()}|${metaJson}`,
      "utf8"
    )
    .digest("hex");
  return h.slice(0, 32);
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
  const slice = rest > 0 ? String(requestText).slice(0, rest) : "";
  return `${prefix}\n${slice}`.slice(0, max);
}

async function findExistingByIdempotency(token) {
  const gt = dvF.intakeField("gate_token");
  const filter = `${gt} eq ${odataQuote(token.slice(0, 64))}`;
  const pathQ = `${INTAKE_ENTITY()}?$filter=${encodeURIComponent(filter)}&$select=${dvF.intakePkCol()}&$top=1`;
  const res = await dvStore.odataRequest("GET", pathQ, null, null, { timeoutMs: 20000 });
  if (!res.ok) {
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

async function createIntakeRow(payload) {
  const res = await dvStore.odataRequest(
    "POST",
    INTAKE_ENTITY(),
    payload,
    { Prefer: "return=representation" },
    { timeoutMs: 25000 }
  );
  let id = null;
  if (res.ok && res.data && pickIntakeId(res.data)) id = pickIntakeId(res.data);
  if (res.ok && !id) {
    const tok = payload[dvF.intakeField("gate_token")];
    const again = await findExistingByIdempotency(tok);
    if (again.ok && again.row) id = pickIntakeId(again.row);
  }
  return { ok: res.ok, id, error: res.ok ? null : res.error || "intake_post_failed" };
}

/**
 * Phase 1 contract: snake_case preferred; camelCase aliases supported.
 */
function isPhase1DvIntakeBody(body) {
  if (!body || typeof body !== "object") return false;
  const cn = pickStr(body, "customer_name", "customerName");
  const ci = pickStr(body, "contact_info", "contactInfo");
  const rt = pickStr(body, "request_text", "requestText");
  const rawSrc = body.source != null ? String(body.source).trim().toLowerCase() : "";
  const srcAllowed = SOURCE_ALIASES[rawSrc];
  return Boolean(cn && ci && rt && rawSrc && srcAllowed);
}

/**
 * Handles Phase 1 Dataverse intake. Returns true if this handler consumed the response.
 */
async function tryHandlePhase1DvIntakePost(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!isPhase1DvIntakeBody(body)) return false;

  let metadata = body.metadata != null ? body.metadata : {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    res.status(400).json({
      ok: false,
      error: "INVALID_METADATA",
      code: "metadata_must_be_object",
    });
    return true;
  }

  const customerName = pickStr(body, "customer_name", "customerName");
  const contactInfo = pickStr(body, "contact_info", "contactInfo");
  const requestText = pickStr(body, "request_text", "requestText");
  const sourceRaw = String(body.source || "").trim().toLowerCase();
  const channel = SOURCE_ALIASES[sourceRaw];

  if (!dvStore.isConfigured()) {
    res.status(503).json({
      ok: false,
      error: "dataverse_not_configured",
      code: "SYSTEM_ERROR",
    });
    return true;
  }

  const idemp = idempotencyToken(customerName, contactInfo, requestText, metadata);
  const syncedAt = new Date().toISOString();
  const name = buildName(customerName, sourceRaw);

  const metaForPayload = {
    v: "phase1",
    phase: "1",
    next_action: "AI parse required",
    priority: "normal",
    blocked_reason: null,
    source: sourceRaw,
    metadata,
    last_synced_at: syncedAt,
  };

  const dvBody = {
    [dvF.intakeField("name")]: name,
    [dvF.intakeField("channel")]: channel,
    [dvF.intakeField("status")]: "INTAKE_NEW",
    [dvF.intakeField("customer_name")]: String(customerName).slice(0, 200),
    [dvF.intakeField("contact_info")]: String(contactInfo).slice(0, 500),
    [dvF.intakeField("deposit_paid")]: false,
    [dvF.intakeField("gate_token")]: idemp.slice(0, 64),
    [dvF.intakeField("raw_payload")]: buildRawPayload(requestText, metaForPayload),
  };

  try {
    const existing = await findExistingByIdempotency(idemp);
    if (!existing.ok) {
      logger.error(
        "[phase1DvIntake] idempotency lookup failed (verify CHEEKY_DV_INTAKE_GATE_TOKEN_* / intake columns): " +
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
    if (existing.row && pickIntakeId(existing.row)) {
      const iid = pickIntakeId(existing.row);
      try {
        require(path.join(__dirname, "cheekyOsRuntimeObservability.service")).recordIntakeAccepted();
      } catch (_) {}
      res.status(200).json({
        ok: true,
        intake_id: iid,
        status: "NEW",
        duplicate: true,
      });
      return true;
    }

    const created = await createIntakeRow(dvBody);

    if (!created.ok || !created.id) {
      logger.error("[phase1DvIntake] intake create failed: " + (created.error || "unknown"));
      await ctSync
        .writeAuditEvent({
          name: "PHASE1_INTAKE_CREATE_FAIL",
          message: String(created.error || "intake_post_failed"),
          eventType: "NODE_SYNC",
          severity: "HIGH",
          actor: "system:phase1-intake-api",
          payloadJson: JSON.stringify({
            customerName: String(customerName).slice(0, 80),
            source: sourceRaw,
            gate_token: idemp.slice(0, 32),
          }),
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
        name: "PHASE1_INTAKE_CREATED",
        message: `Intake row created · source=${sourceRaw} · channel=${channel}`,
        eventType: "NODE_SYNC",
        severity: "INFO",
        actor: "system:phase1-intake-api",
        relatedIntakeId: intakeId,
        payloadJson: JSON.stringify({
          intake_id: intakeId,
          source: sourceRaw,
          idempotency: idemp.slice(0, 32),
        }).slice(0, 11800),
      })
      .catch(() => {});

    scheduleIntakeBrainIfEnabled(intakeId);

    try {
      require(path.join(__dirname, "cheekyOsRuntimeObservability.service")).recordIntakeAccepted();
    } catch (_) {}

    res.status(200).json({
      ok: true,
      intake_id: intakeId,
      status: "NEW",
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[phase1DvIntake] " + msg);
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
  isPhase1DvIntakeBody,
  tryHandlePhase1DvIntakePost,
  SOURCE_ALIASES,
};
