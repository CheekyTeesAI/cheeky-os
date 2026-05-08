"use strict";

/**
 * CHEEKY OS Phase 2 — AI brain: parse ct_intake_queue rows in INTAKE_NEW → AI_PARSED / REVIEW_NEEDED.
 *
 * OData: PATCH CHEEKY_CT_INTAKE_ENTITY_SET (default ct_intake_queues).
 * Env: OPENAI_API_KEY, OPENAI_MODEL or CHEEKY_AI_BRAIN_MODEL,
 *      CHEEKY_INTAKE_AI_AUTO_PARSE (default true) — runs after Phase 1 POST intake.
 */

const path = require("path");

const dvStore = require(path.join(__dirname, "..", "data", "dataverse-store"));
const ctSync = require(path.join(__dirname, "ctSync.service"));
const dvF = require(path.join(__dirname, "dvPublisherColumns.service"));
const { fetchSafeTransientRetry } = require(path.join(__dirname, "cheekyOsHttpRetry.service"));
const { logger } = require(path.join(__dirname, "..", "utils", "logger"));

const INTAKE_ENTITY = () => dvF.intakeEntitySet();

const CHEEKY_AI_SYSTEM_PROMPT = `You are Cheeky AI — ruthless order parser for Cheeky Tees. Convert raw customer request into strict JSON only.
Rules:
Default garment: Gildan Softstyle
Margin target: 45% minimum (price = cost / 0.55)
Routing: DTF (default), DTG (small qty), Screen (large qty), Vendor (special)
Print locations: FLC, Full Back, etc.
Output ONLY valid JSON: { "qty": number, "garment": string, "garment_color": string, "print_locations": array, "method": "DTF"|"DTG"|"Screen"|"Vendor", "estimated_cost": number, "recommended_price": number, "margin": number, "task_checklist_template": array, "confidence": number, "notes": string }`;

const METHODS = new Set(["DTF", "DTG", "Screen", "Vendor"]);

function brainModel() {
  return (
    String(process.env.CHEEKY_AI_BRAIN_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim() ||
    "gpt-4o-mini"
  );
}

function stripJsonFences(text) {
  let s = String(text || "").trim();
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) s = m[1].trim();
  return s;
}

function extractRequestText(ctRawPayload) {
  const s = String(ctRawPayload || "").trim();
  if (!s) return "";
  const nl = s.indexOf("\n");
  if (nl === -1) return s;
  return s.slice(nl + 1).trim() || s;
}

function openAiHttpErrorDetail(data) {
  if (!data || typeof data !== "object") return "";
  const err = data.error;
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * Minimal structural validation after model output.
 * @param {object} o
 */
function validateBrainJson(o) {
  const errors = [];
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, errors: ["not_object"] };
  if (!Number.isFinite(Number(o.qty)) || Number(o.qty) <= 0) errors.push("qty_invalid");
  if (typeof o.garment !== "string" || !String(o.garment).trim()) errors.push("garment_required");
  if (typeof o.garment_color !== "string") errors.push("garment_color_type");
  if (!Array.isArray(o.print_locations)) errors.push("print_locations_array");
  if (!METHODS.has(String(o.method || ""))) errors.push("method_enum");
  for (const k of ["estimated_cost", "recommended_price", "margin", "confidence"]) {
    const n = Number(o[k]);
    if (!Number.isFinite(n)) errors.push(`${k}_number`);
  }
  if (!Array.isArray(o.task_checklist_template)) errors.push("task_checklist_template_array");
  if (typeof o.notes !== "string") errors.push("notes_string");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {string} intakeGuid
 */
async function fetchIntakeRow(intakeGuid) {
  const guid = String(intakeGuid || "").trim();
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(guid)) {
    return { ok: false, row: null, error: "invalid_intake_guid" };
  }
  const invF = dvF.intakeSquareInvoiceField();
  const select = [
    dvF.intakePkCol(),
    dvF.intakeField("status"),
    dvF.intakeField("raw_payload"),
    dvF.intakeField("customer_name"),
    dvF.intakeField("contact_info"),
    dvF.intakeField("parsed_json"),
    invF,
  ].join(",");
  const urlPath = `${INTAKE_ENTITY()}(${guid})?$select=${select}`;
  const res = await dvStore.odataRequest("GET", urlPath, null, null, { timeoutMs: 25000 });
  if (!res.ok) return { ok: false, row: null, error: res.error || "get_failed" };
  return { ok: true, row: res.data, error: null };
}

async function patchIntakeParsed(intakeGuid, parsedJsonString, statusChoice) {
  const guid = String(intakeGuid || "").trim();
  const body = {
    [dvF.intakeField("parsed_json")]: String(parsedJsonString).slice(0, 100000),
    [dvF.intakeField("status")]: statusChoice,
  };
  const pathSuffix = `${INTAKE_ENTITY()}(${guid})`;
  return dvStore.odataRequest("PATCH", pathSuffix, body, null, { timeoutMs: 25000 });
}

/**
 * Call OpenAI and return parsed object or error.
 * @param {string} customerContext one-line summary
 * @param {string} requestText
 */
async function callOpenAiBrain(customerContext, requestText) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return { ok: false, error: "OPENAI_API_KEY not set" };

  const userBlock = [
    "Customer context (may be empty):",
    String(customerContext || "").slice(0, 2000),
    "",
    "Raw customer request:",
    String(requestText || "").slice(0, 16000),
  ].join("\n");

  const res = await fetchSafeTransientRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model: brainModel(),
        temperature: 0.15,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CHEEKY_AI_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "Return only the JSON object described in system instructions. Input:\n\n" + userBlock,
          },
        ],
      }),
      timeoutMs: 120000,
    },
    { label: "openai-chat-completions" }
  );

  if (!res.ok) {
    const detail = openAiHttpErrorDetail(res.data);
    return {
      ok: false,
      error: detail ? `${res.error}: ${detail}` : res.error || "openai_failed",
    };
  }

  const choice = res.data && res.data.choices && res.data.choices[0];
  const content =
    choice && choice.message && typeof choice.message.content === "string"
      ? choice.message.content
      : "";

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(content));
  } catch (e) {
    return {
      ok: false,
      error: "json_parse_failed: " + (e && e.message ? e.message : String(e)),
      rawContent: String(content).slice(0, 4000),
    };
  }

  const checked = validateBrainJson(parsed);
  if (!checked.ok) {
    return {
      ok: false,
      error: "validation_failed: " + checked.errors.join(", "),
      parsed,
    };
  }

  return { ok: true, parsed, rawContent: content };
}

function isIntakeNewStatus(displayLabel, rawValue) {
  const d = displayLabel != null ? String(displayLabel).trim().toUpperCase() : "";
  if (d === "INTAKE_NEW") return true;
  if (rawValue == null || rawValue === "") return false;
  const s = String(rawValue).trim();
  if (s === "INTAKE_NEW") return true;
  const envNum = String(process.env.CHEEKY_CT_STATUS_INTAKE_NEW_NUM || "").trim();
  return envNum.length > 0 && s === envNum;
}

/**
 * Run brain for a Dataverse intake row GUID. Idempotent: skips if not INTAKE_NEW.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, intake_id?: string, status?: string, parsed?: object, error?: string }>}
 */
async function runIntakeBrainParse(intakeGuid, options = {}) {
  const force = options.force === true;
  if (!dvStore.isConfigured()) {
    return { ok: false, error: "dataverse_not_configured" };
  }

  const got = await fetchIntakeRow(intakeGuid);
  if (!got.ok || !got.row) {
    return { ok: false, error: got.error || "intake_not_found" };
  }

  const row = got.row;
  const pj = dvF.intakeField("parsed_json");
  const parsedAlready = row[pj] != null && String(row[pj]).trim().length > 0;
  if (!force && parsedAlready) {
    return {
      ok: true,
      skipped: true,
      reason: "parsed_json_already_set",
      intake_id: intakeGuid,
    };
  }

  const sk = dvF.intakeField("status");
  const lblRaw = dvF.readChoiceLabel(row, sk);
  const lbl = lblRaw ? String(lblRaw).trim().toUpperCase() : "";
  const rawStatus = row[sk];
  if (!force) {
    const hasSignal =
      lbl !== "" ||
      (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== "");
    if (hasSignal && !isIntakeNewStatus(lbl, rawStatus)) {
      return {
        ok: true,
        skipped: true,
        reason: "not_INTAKE_NEW",
        intake_id: intakeGuid,
        dv_status: lbl || String(rawStatus || "").trim(),
      };
    }
  }

  const requestText = extractRequestText(row[dvF.intakeField("raw_payload")]);
  if (!requestText) {
    return { ok: false, error: "empty_request_from_raw_payload" };
  }

  const cn = dvF.intakeField("customer_name");
  const ci = dvF.intakeField("contact_info");
  const cust = [
    row[cn] != null ? `name:${String(row[cn])}` : "",
    row[ci] != null ? `contact:${String(row[ci])}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (!String(process.env.OPENAI_API_KEY || "").trim()) {
    return {
      ok: false,
      error: "OPENAI_API_KEY_required_for_ai_parse",
      intake_id: intakeGuid,
      code: "openai_missing",
    };
  }

  const ai = await callOpenAiBrain(cust, requestText);
  if (!ai.ok) {
    await ctSync
      .writeAuditEvent({
        name: "INTAKE_AI_PARSE_FAIL",
        message: String(ai.error || "").slice(0, 3900),
        eventType: "NODE_SYNC",
        severity: "WARN",
        actor: "system:cheeky-intake-brain",
        relatedIntakeId: intakeGuid,
        payloadJson: JSON.stringify({ error: ai.error }).slice(0, 11800),
      })
      .catch(() => {});
    return { ok: false, error: ai.error, intake_id: intakeGuid };
  }

  let conf = Number(ai.parsed.confidence);
  if (conf > 1 && conf <= 100) conf = conf / 100;
  const dvStatus =
    !Number.isFinite(conf) || conf < 0.75 ? "REVIEW_NEEDED" : "AI_PARSED";

  const jsonStr = JSON.stringify(ai.parsed);
  const patch = await patchIntakeParsed(intakeGuid, jsonStr, dvStatus);
  if (!patch.ok) {
    logger.error("[cheekyIntakeBrain] PATCH failed: " + (patch.error || ""));
    return { ok: false, error: patch.error || "patch_failed", intake_id: intakeGuid, parsed: ai.parsed };
  }

  await ctSync
    .writeAuditEvent({
      name: dvStatus === "REVIEW_NEEDED" ? "INTAKE_AI_REVIEW_NEEDED" : "INTAKE_AI_PARSED",
      message: `confidence=${conf} method=${ai.parsed.method} qty=${ai.parsed.qty}`,
      eventType: "NODE_SYNC",
      severity: dvStatus === "REVIEW_NEEDED" ? "WARN" : "INFO",
      actor: "system:cheeky-intake-brain",
      relatedIntakeId: intakeGuid,
      payloadJson: JSON.stringify({
        intake_id: intakeGuid,
        status: dvStatus,
        confidence: conf,
      }).slice(0, 11800),
    })
    .catch(() => {});

  /** Phase 3: optional Square deposit invoice draft (HIGH confidence AI_PARSED). */
  let square_invoice = null;
  try {
    const bridge = require(path.join(__dirname, "intakeSquareBridge.service"));
    const invCol = dvF.intakeSquareInvoiceField();
    square_invoice = await bridge.maybeCreateSquareInvoiceDraftAfterBrainParse({
      intakeGuid,
      dvStatus,
      parsed: ai.parsed,
      ct_contact_info: row[dvF.intakeField("contact_info")],
      ct_customer_name: row[dvF.intakeField("customer_name")],
      existingSquareInvoiceId: row[invCol] != null ? row[invCol] : undefined,
    });
  } catch (sqErr) {
    logger.warn(
      "[cheekyIntakeBrain] intakeSquareBridge: " +
        (sqErr && sqErr.message ? sqErr.message : String(sqErr))
    );
  }

  return {
    ok: true,
    intake_id: intakeGuid,
    status: dvStatus,
    parsed: ai.parsed,
    square_invoice,
  };
}

function autoParseEnabled() {
  const raw = String(process.env.CHEEKY_INTAKE_AI_AUTO_PARSE || "").trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

/**
 * Fire-and-forget after Phase 1 create (non-blocking).
 * @param {string} intakeGuid
 */
function scheduleIntakeBrainIfEnabled(intakeGuid) {
  if (!autoParseEnabled()) return;
  if (!String(process.env.OPENAI_API_KEY || "").trim()) {
    logger.warn("[cheekyIntakeBrain] skip auto-parse: OPENAI_API_KEY unset");
    return;
  }
  const id = String(intakeGuid || "").trim();
  setImmediate(() => {
    runIntakeBrainParse(id, { force: false })
      .then((out) => {
        if (out.ok && !out.skipped) {
          logger.info(
            `[cheekyIntakeBrain] auto-parse ok intake=${id} status=${out.status || ""}`
          );
        } else if (out.ok && out.skipped) {
          logger.info(`[cheekyIntakeBrain] auto-parse skipped intake=${id} ${out.reason || ""}`);
        } else {
          logger.warn("[cheekyIntakeBrain] auto-parse failed: " + (out.error || ""));
        }
      })
      .catch((e) => {
        logger.warn(
          "[cheekyIntakeBrain] auto-parse exception: " + (e && e.message ? e.message : e)
        );
      });
  });
}

module.exports = {
  CHEEKY_AI_SYSTEM_PROMPT,
  runIntakeBrainParse,
  scheduleIntakeBrainIfEnabled,
  extractRequestText,
  validateBrainJson,
  autoParseEnabled,
};
