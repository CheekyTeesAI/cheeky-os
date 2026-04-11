import { dataverseReadAll, formattedChoice, pick, type DataverseRow } from "./dataverseRead";

export type SystemOrderStatus =
  | "Intake"
  | "Quote Sent"
  | "Deposit Paid"
  | "Production Ready"
  | "Printing"
  | "Completed";

export type Job = {
  id: string;
  name: string;
  customerName: string | null;
  status: SystemOrderStatus;
  stage: string | null;
  dueDate: string | null;
  type: "DTG" | "DTF" | "ScreenPrint" | "Unknown";
  qty: number;
  notes: string | null;
  rush: boolean;
};

const DEFAULT_ENTITY_SET = process.env.DATAVERSE_NEW_ORDERS_ENTITY_SET || "new_orderses";
const DEFAULT_SELECT_FIELDS = [
  "new_ordersid",
  "new_name",
  "new_customername",
  "new_quantitiessummary",
  "new_productiontyperouting",
  "new_duedate",
  "createdon",
  "new_notes",
  "new_orderstage",
  "new_orderstatus",
  "statuscode",
  "statecode"
].join(",");

function parseQtySummary(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  const s = String(raw ?? "").trim();
  const nums = s.match(/\d+/g);
  if (!nums || nums.length === 0) return 0;
  const total = nums.reduce((acc, n) => acc + parseInt(n, 10), 0);
  return Math.max(0, total);
}

function mapProductionType(row: DataverseRow): Job["type"] {
  const logical = "new_productiontyperouting";
  const label =
    formattedChoice(row, logical) ||
    String(pick(row, "new_productiontyperouting") ?? "").toLowerCase();
  const combined = label.toLowerCase();
  if (combined.includes("dtf")) return "DTF";
  if (combined.includes("screen") || combined.includes("silk")) return "ScreenPrint";
  const code = pick(row, "new_productiontyperouting");
  if (typeof code === "number") {
    if (code === 100000001) return "DTF";
    if (code === 100000002) return "ScreenPrint";
  }
  return "DTG";
}

function rowDueDate(row: DataverseRow): string | null {
  const v = pick(row, "createdon", "new_duedate", "new_requesteddelivery");
  if (typeof v === "string" && v.length >= 10) {
    return v.slice(0, 10);
  }
  return null;
}

function notesRush(row: DataverseRow): boolean {
  const notes = String(pick(row, "new_notes", "description") ?? "").toLowerCase();
  return notes.includes("rush");
}

function mapSystemStatus(row: DataverseRow): SystemOrderStatus {
  const stageLabel = String(
    formattedChoice(row, "new_orderstage") ||
      formattedChoice(row, "new_orderstatus") ||
      pick(row, "new_orderstage", "new_orderstatus", "statuscode") ||
      ""
  ).toLowerCase();

  if (stageLabel.includes("complete")) return "Completed";
  if (stageLabel.includes("printing") || stageLabel.includes("production")) return "Printing";
  if (stageLabel.includes("ready")) return "Production Ready";
  if (stageLabel.includes("deposit")) return "Deposit Paid";
  if (stageLabel.includes("quote")) return "Quote Sent";
  if (stageLabel.includes("intake") || stageLabel.includes("new")) return "Intake";

  const code = pick(row, "new_orderstage", "new_orderstatus", "statuscode");
  if (code === 100000003) return "Completed";
  if (code === 100000002) return "Printing";
  if (code === 100000001) return "Deposit Paid";
  return "Intake";
}

function isCompletedRow(row: DataverseRow): boolean {
  const statusLabel = String(
    formattedChoice(row, "new_orderstage") ||
      formattedChoice(row, "new_orderstatus") ||
      formattedChoice(row, "new_status") ||
      pick(row, "new_orderstatusname", "new_statusname", "new_orderstatus", "new_status") ||
      ""
  ).toLowerCase();
  if (statusLabel.includes("complete")) return true;

  const code = pick(row, "new_orderstage", "new_orderstatus", "new_status", "statuscode");
  if (code === 100000003) return true;

  const state = pick(row, "statecode");
  if (state === 1) return true;

  return false;
}

function rowToJob(row: DataverseRow): Job {
  const orderName = String(pick(row, "new_name", "new_ordername") ?? "").trim();
  const customer = String(pick(row, "new_customername", "new_customer") ?? "").trim();
  const orderId = String(pick(row, "new_ordersid", "activityid", "new_orderid") ?? "").trim();
  const notesRaw = pick(row, "new_notes", "description");
  const name =
    orderName ||
    customer ||
    `Order ${orderId.slice(-8) || "active"}`;

  return {
    id: orderId || `order-${name.replace(/\s+/g, "-").toLowerCase()}`,
    name,
    customerName: customer || null,
    status: mapSystemStatus(row),
    stage: String(formattedChoice(row, "new_orderstage") || "").trim() || null,
    dueDate: rowDueDate(row),
    type: mapProductionType(row),
    qty: Math.max(0, parseQtySummary(pick(row, "new_quantitiessummary"))),
    notes: typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null,
    rush: notesRush(row)
  };
}

/**
 * Returns active `new_orders` rows (status ≠ Completed) normalized for production scheduling.
 * On any failure or missing config → `[]`.
 */
export async function getActiveOrders(): Promise<Job[]> {
  try {
    const select = process.env.DATAVERSE_NEW_ORDERS_SELECT?.trim() || DEFAULT_SELECT_FIELDS;
    const rows = await dataverseReadAll(DEFAULT_ENTITY_SET, select);
    return rows
      .filter((r) => pick(r, "statecode") !== 1)
      .filter((r) => !isCompletedRow(r))
      .map(rowToJob);
  } catch {
    return [];
  }
}
