"use strict";
/**
 * Live Dataverse-backed queue for operator "what_needs_printing".
 * Requires DATAVERSE_* + CHEEKY_DV_PUBLISHER_PREFIX / CHEEKY_CT_* (same as cheeky-os intake).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listIntakesEligibleForPrinting = listIntakesEligibleForPrinting;
const path_1 = __importDefault(require("path"));
async function listIntakesEligibleForPrinting() {
    try {
        // Resolve from compiled dist/services → repo root cheeky-os
        const dvStorePath = path_1.default.join(__dirname, "..", "..", "cheeky-os", "data", "dataverse-store.js");
        const dvFpath = path_1.default.join(__dirname, "..", "..", "cheeky-os", "services", "dvPublisherColumns.service.js");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const dvStore = require(dvStorePath);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const dvF = require(dvFpath);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const safeMapper = require(path_1.default.join(__dirname, "..", "..", "cheeky-os", "intake", "intakeQueueSafeMapper.js"));
        if (!dvStore.isConfigured?.()) {
            return { ok: true, jobs: [] };
        }
        const entity = dvF.intakeEntitySet();
        const nameCol = dvF.intakeField("customer_name");
        const statusCol = dvF.intakeField("status");
        const rawCol = dvF.intakeField("raw_payload");
        const parsedCol = dvF.intakeField("parsed_json");
        const gateTokCol = dvF.intakeField("gate_token");
        const pk = dvF.intakePkCol();
        /** Try $select variants — Maker logical names often differ; full list 400s if any column is wrong. */
        const selectVariants = [
            [pk, nameCol, statusCol, rawCol, parsedCol, gateTokCol, "createdon"],
            [pk, nameCol, statusCol, rawCol, gateTokCol, "createdon"],
            [pk, statusCol, rawCol, gateTokCol, "createdon"],
            [pk, statusCol, gateTokCol, "createdon"],
        ].map((cols) => cols.filter(Boolean).join(","));
        let res = null;
        let lastErr = "";
        for (const select of selectVariants) {
            const urlPath = `${entity}?$select=${encodeURIComponent(select)}&$orderby=createdon desc&$top=80`;
            // eslint-disable-next-line no-await-in-loop
            const attempt = await dvStore.odataRequest("GET", urlPath, null, null, {
                timeoutMs: 25000,
            });
            res = attempt;
            if (attempt.ok) {
                break;
            }
            lastErr = String(attempt.error || "odata_get_failed");
            if (!/Could not find a property|400:\s*Bad Request/i.test(lastErr)) {
                break;
            }
        }
        if (!res || !res.ok) {
            console.warn("[DATAVERSE] Intake queue OData failed — align CHEEKY_DV_INTAKE_*_LOGICALNAME / TAIL with Maker columns, or see cheeky-os/services/dvPublisherColumns.service.js. Last:", lastErr.slice(0, 380));
            return {
                ok: false,
                error: String(lastErr || res?.error || "odata_get_failed"),
            };
        }
        const rows = (res.data?.value ?? []);
        const mappedRows = safeMapper.mapIntakeRows(rows);
        const allowed = new Set(["INTAKE_NEW", "AI_PARSED"]);
        const jobs = [];
        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const mapped = mappedRows[i] || safeMapper.mapIntakeRow(row);
            const lbl = String(dvF.readChoiceLabel(row, statusCol) || "").trim().toUpperCase();
            const rawSt = mapped.status != null ? String(mapped.status).trim().toUpperCase() : "";
            const st = lbl || rawSt;
            if (!allowed.has(st))
                continue;
            const rawPayload = typeof row[rawCol] === "string" ? row[rawCol] : String(row[rawCol] ?? "");
            const nl = rawPayload.indexOf("\n");
            const requestSnippet = nl >= 0
                ? rawPayload.slice(nl + 1).trim().slice(0, 2000)
                : rawPayload.slice(0, 2000);
            jobs.push({
                orderId: dvF.pickIntakeRowId(row),
                customer: String(mapped.customerName || row[nameCol] || "").trim() || "Customer",
                status: st,
                requestText: requestSnippet || "(empty)",
                parsedJson: row[parsedCol] != null ? String(row[parsedCol]).slice(0, 12000) : null,
                gateToken: row[gateTokCol] != null && row[gateTokCol] !== undefined
                    ? String(row[gateTokCol]).slice(0, 80)
                    : null,
                createdon: row.createdon != null && row.createdon !== undefined
                    ? String(row.createdon)
                    : null,
                schemaWarnings: Array.isArray(mapped.schemaWarnings) ? mapped.schemaWarnings : [],
            });
        }
        return { ok: true, jobs };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
}
