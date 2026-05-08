"use strict";

/**
 * Publisher prefix for custom Dataverse columns (ct vs cr2d1, …).
 *
 * CHEEKY_DV_PUBLISHER_PREFIX=cr2d1 → cr2d1_name, cr2d1_gate_token, cr2d1_status, …
 * Default ct → preserves existing deployments.
 *
 * Idempotency / gate column ≠ row PK:
 * - `CHEEKY_DV_INTAKE_GATE_TOKEN_TAIL` / `CHEEKY_DV_INTAKE_GATE_TOKEN_LOGICALNAME` → OData name
 *   Copilot/Maker gave the intake table (fixes 400 when `cr2d1_gate_token` does not exist).
 * - `CHEEKY_DV_INTAKE_PK_TAIL` / `CHEEKY_DV_INTAKE_PK_LOGICALNAME` → **Intake Queue row id**
 *   (`*_intakequeueid`), not the gate token column.
 */

const PREFIX = () => String(process.env.CHEEKY_DV_PUBLISHER_PREFIX || "ct").trim() || "ct";

/** OData property: name, gate_token, status, intakequeueid … */
function col(tailSnakeWithoutPrefix) {
  return `${PREFIX()}_${tailSnakeWithoutPrefix}`;
}

/**
 * OData logical column on **Intake Queue** only.
 * Copilot / Maker often differs from `{prefix}_{tail}` guesses (e.g. `cr2d1_gateid` vs `cr2d1_gate_token`).
 *
 * Per-field overrides (first wins):
 *   CHEEKY_DV_INTAKE_GATE_TOKEN_LOGICALNAME=cr2d1_gateid
 *   CHEEKY_DV_INTAKE_GATE_TOKEN_TAIL=gateid        → resolves to `{prefix}_gateid`
 * Same pattern for QUEUE_STATUS, CUSTOMER_NAME, RAW_PAYLOAD, PARSED_JSON, CONTACT_INFO,
 * NAME, CHANNEL, DEPOSIT_PAID.
 */
function intakeEnv(name) {
  return String(process.env[name] || "").trim();
}

function intakeLogical(primaryFull, primaryTail, defaultTailSnake, altFull, altTail) {
  let v = intakeEnv(primaryFull);
  if (v) return v;
  if (altFull) {
    v = intakeEnv(altFull);
    if (v) return v;
  }
  v = intakeEnv(primaryTail);
  if (v) return col(v);
  if (altTail && intakeEnv(altTail)) return col(intakeEnv(altTail));
  return col(defaultTailSnake);
}

function intakeField(key) {
  const k = String(key || "").trim().toLowerCase();
  switch (k) {
    case "gate_token":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_GATE_TOKEN_LOGICALNAME",
        "CHEEKY_DV_INTAKE_GATE_TOKEN_TAIL",
        "gate_token"
      );
    case "status":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_QUEUE_STATUS_LOGICALNAME",
        "CHEEKY_DV_INTAKE_QUEUE_STATUS_TAIL",
        "status",
        "CHEEKY_DV_INTAKE_STATUS_LOGICALNAME",
        "CHEEKY_DV_INTAKE_STATUS_TAIL"
      );
    case "customer_name":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_CUSTOMER_NAME_LOGICALNAME",
        "CHEEKY_DV_INTAKE_CUSTOMER_NAME_TAIL",
        "customer_name"
      );
    case "contact_info":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_CONTACT_INFO_LOGICALNAME",
        "CHEEKY_DV_INTAKE_CONTACT_INFO_TAIL",
        "contact_info"
      );
    case "raw_payload":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_RAW_PAYLOAD_LOGICALNAME",
        "CHEEKY_DV_INTAKE_RAW_PAYLOAD_TAIL",
        "raw_payload"
      );
    case "parsed_json":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_PARSED_JSON_LOGICALNAME",
        "CHEEKY_DV_INTAKE_PARSED_JSON_TAIL",
        "parsed_json"
      );
    case "name":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_NAME_LOGICALNAME",
        "CHEEKY_DV_INTAKE_NAME_TAIL",
        "name"
      );
    case "channel":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_CHANNEL_LOGICALNAME",
        "CHEEKY_DV_INTAKE_CHANNEL_TAIL",
        "channel"
      );
    case "deposit_paid":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_DEPOSIT_PAID_LOGICALNAME",
        "CHEEKY_DV_INTAKE_DEPOSIT_PAID_TAIL",
        "deposit_paid"
      );
    case "production_stage_code":
      return intakeLogical(
        "CHEEKY_DV_INTAKE_PRODUCTION_STAGE_CODE_LOGICALNAME",
        "CHEEKY_DV_INTAKE_PRODUCTION_STAGE_CODE_TAIL",
        "production_stage_code"
      );
    default:
      return col(k);
  }
}

/**
 * Logical tail for the Intake Queue primary key (`ct_intake_queueid` vs `cr2d1_intakequeueid`).
 * Override with CHEEKY_DV_INTAKE_PK_TAIL=intake_queueid|intakequeueid
 */
function intakePkTail() {
  const o = String(process.env.CHEEKY_DV_INTAKE_PK_TAIL || "").trim();
  if (o) return o;
  return PREFIX() === "ct" ? "intake_queueid" : "intakequeueid";
}

/** Full OData column name for the Intake Queue row PK (`ct_intake_queueid`, `cr2d1_intakequeueid`). */
function intakePkCol() {
  const full = String(process.env.CHEEKY_DV_INTAKE_PK_LOGICALNAME || "").trim();
  if (full) return full;
  return col(intakePkTail());
}

function intakeEntitySet() {
  return (
    process.env.CHEEKY_CT_INTAKE_ENTITY_SET || "ct_intake_queues"
  ).trim();
}

function auditEntitySet() {
  return (
    process.env.CHEEKY_CT_AUDIT_ENTITY_SET || "ct_audit_events"
  ).trim();
}

/** Square correlation field on intake (prefix-aware). */
function intakeSquareInvoiceField() {
  const e = process.env.CHEEKY_CT_INTAKE_SQUARE_INVOICE_FIELD;
  if (e != null && String(e).trim()) return String(e).trim();
  return col("square_invoice_id");
}

/**
 * Identify intake PK on GET response (publisher-specific).
 */
function pickIntakeRowId(row) {
  if (!row || typeof row !== "object") return null;
  const extras = String(process.env.CHEEKY_DV_INTAKE_ROW_ID_FIELDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const p = PREFIX();

  const tryKeys = [];
  const push = (k) => {
    if (k && !tryKeys.includes(k)) tryKeys.push(k);
  };

  extras.forEach(push);
  push(intakePkCol());
  push(`${p}_intakequeueid`);
  push(`${p}_intake_queueid`);
  push("cr2d1_intakequeueid");
  push("ct_intake_queueid");
  push("ct_intakequeueid");

  for (const k of tryKeys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") {
      return String(row[k]);
    }
  }
  return null;
}

/** OData bind key for intake lookup on audit / related rows POST. */
function intakeLookupBindKey() {
  const e = String(process.env.CHEEKY_DV_AUDIT_INTAKE_LOOKUP_BIND_KEY || "").trim();
  if (e) return e;
  return `${col(intakePkTail())}@odata.bind`;
}

/**
 * Readable choice label for intake queue choice columns.
 * @param row OData entity
 * @param logicalName Full column logical name — use **`intakeField('status')`** etc.
 */
function readChoiceLabel(row, logicalName) {
  if (!row || typeof row !== "object" || !logicalName) return "";
  const sk = String(logicalName);
  const fvKey = `${sk}@OData.Community.Display.V1.FormattedValue`;
  if (row[fvKey] != null && String(row[fvKey]).trim()) return String(row[fvKey]).trim();
  if (row[sk] != null && row[sk] !== "") return String(row[sk]).trim();
  return "";
}

module.exports = {
  PREFIX,
  col,
  intakeField,
  intakePkTail,
  intakePkCol,
  intakeEntitySet,
  auditEntitySet,
  intakeSquareInvoiceField,
  pickIntakeRowId,
  intakeLookupBindKey,
  readChoiceLabel,
};
