import { dataverseReadAll, formattedChoice, pick, type DataverseRow } from "./dataverseRead";

export type ActiveTask = {
  id: string;
  taskName: string;
  relatedOrder: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  status: string | null;
};

const DEFAULT_ENTITY_SET = process.env.DATAVERSE_TASKS_ENTITY_SET || "tasks";
const SELECT_FIELDS = [
  "activityid",
  "subject",
  "_regardingobjectid_value",
  "_ownerid_value",
  "scheduledend",
  "statuscode",
  "statecode"
].join(",");

function isCompletedTask(row: DataverseRow): boolean {
  const label = String(
    formattedChoice(row, "statuscode") ||
      formattedChoice(row, "statecode") ||
      pick(row, "statuscode", "statecode") ||
      ""
  ).toLowerCase();
  if (label.includes("complete")) return true;
  return pick(row, "statecode") === 1;
}

function toTask(row: DataverseRow): ActiveTask {
  const dueRaw = pick(row, "scheduledend");
  const dueDate =
    typeof dueRaw === "string" && dueRaw.length >= 10 ? dueRaw.slice(0, 10) : null;

  return {
    id: String(pick(row, "activityid") ?? ""),
    taskName: String(pick(row, "subject") ?? "Task"),
    relatedOrder:
      formattedChoice(row, "_regardingobjectid_value") ||
      (pick(row, "_regardingobjectid_value")
        ? String(pick(row, "_regardingobjectid_value"))
        : null),
    assignedTo:
      formattedChoice(row, "_ownerid_value") ||
      (pick(row, "_ownerid_value") ? String(pick(row, "_ownerid_value")) : null),
    dueDate,
    status:
      formattedChoice(row, "statuscode") ||
      formattedChoice(row, "statecode") ||
      (pick(row, "statuscode") ? String(pick(row, "statuscode")) : null)
  };
}

export async function getActiveTasks(): Promise<ActiveTask[]> {
  try {
    const select = process.env.DATAVERSE_TASKS_SELECT?.trim() || SELECT_FIELDS;
    const rows = await dataverseReadAll(DEFAULT_ENTITY_SET, select);
    return rows.filter((r) => !isCompletedTask(r)).map(toTask);
  } catch {
    return [];
  }
}
