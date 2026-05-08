/**
 * Live Dataverse-backed queue for operator "what_needs_printing".
 * Requires DATAVERSE_* + CHEEKY_DV_PUBLISHER_PREFIX / CHEEKY_CT_* (same as cheeky-os intake).
 */

import path from "path";

export type PrintQueueJob = {
  orderId: string | null;
  customer: string;
  status: string;
  requestText: string;
  parsedJson?: string | null;
  createdon?: string | null;
  gateToken?: string | null;
};

export async function listIntakesEligibleForPrinting(): Promise<{
  ok: boolean;
  jobs?: PrintQueueJob[];
  error?: string;
}> {
  try {
    // Resolve from compiled dist/services → repo root cheeky-os
    const dvStorePath = path.join(__dirname, "..", "..", "cheeky-os", "data", "dataverse-store.js");
    const dvFpath = path.join(
      __dirname,
      "..",
      "..",
      "cheeky-os",
      "services",
      "dvPublisherColumns.service.js"
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dvStore = require(dvStorePath);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dvF = require(dvFpath);

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

    let res: {
      ok: boolean;
      error?: unknown;
      data?: { value?: Record<string, unknown>[] };
    } | null = null;
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
      console.warn(
        "[DATAVERSE] Intake queue OData failed — align CHEEKY_DV_INTAKE_*_LOGICALNAME / TAIL with Maker columns, or see cheeky-os/services/dvPublisherColumns.service.js. Last:",
        lastErr.slice(0, 380)
      );
      return {
        ok: false,
        error: String(lastErr || res?.error || "odata_get_failed"),
      };
    }

    const rows = (res.data?.value ?? []) as Record<string, unknown>[];
    const allowed = new Set(["INTAKE_NEW", "AI_PARSED"]);
    const jobs: PrintQueueJob[] = [];

    for (const row of rows) {
      const lbl = String(dvF.readChoiceLabel(row, statusCol) || "").trim().toUpperCase();
      const rawSt =
        row[statusCol] != null ? String(row[statusCol]).trim().toUpperCase() : "";
      const st = lbl || rawSt;
      if (!allowed.has(st)) continue;

      const rawPayload = typeof row[rawCol] === "string" ? row[rawCol] : String(row[rawCol] ?? "");
      const nl = rawPayload.indexOf("\n");
      const requestSnippet =
        nl >= 0
          ? rawPayload.slice(nl + 1).trim().slice(0, 2000)
          : rawPayload.slice(0, 2000);

      jobs.push({
        orderId: dvF.pickIntakeRowId(row),
        customer: String(row[nameCol] ?? "").trim() || "Customer",
        status: st,
        requestText: requestSnippet || "(empty)",
        parsedJson:
          row[parsedCol] != null ? String(row[parsedCol]).slice(0, 12000) : null,
        gateToken:
          row[gateTokCol] != null && row[gateTokCol] !== undefined
            ? String(row[gateTokCol]).slice(0, 80)
            : null,
        createdon:
          row.createdon != null && row.createdon !== undefined
            ? String(row.createdon)
            : null,
      });
    }

    return { ok: true, jobs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
