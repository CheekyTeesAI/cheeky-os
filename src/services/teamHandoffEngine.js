/**
 * Route service desk items into role queues.
 */
const {
  listServiceDeskItems,
  updateServiceDeskItem,
  getServiceDeskItem,
} = require("./serviceDeskService");

const ROLES = ["OWNER", "PRINTER", "ADMIN", "DESIGN"];

function getRoleQueue(role) {
  const r = String(role || "").toUpperCase();
  return listServiceDeskItems({
    assignedToRole: r,
    limit: 200,
  }).filter((i) => !/CLOSED|AUTO_HANDLED/i.test(String(i.state || "")));
}

function assignToRole(itemOrId, role, userId) {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId && itemOrId.id;
  return updateServiceDeskItem(id, {
    assignedToRole: String(role || "ADMIN").toUpperCase(),
    assignedToUserId: userId != null ? String(userId) : null,
    state: "WAITING_TEAM",
  });
}

function routeServiceDeskItems() {
  const open = listServiceDeskItems({ limit: 300 }).filter(
    (i) => i && !/CLOSED/i.test(String(i.state || ""))
  );
  const queues = { OWNER: [], PRINTER: [], ADMIN: [], DESIGN: [] };
  for (const item of open) {
    const role = String(item.assignedToRole || "ADMIN").toUpperCase();
    if (queues[role]) queues[role].push(item);
    else queues.ADMIN.push(item);
  }
  return { queues, counts: Object.fromEntries(Object.entries(queues).map(([k, v]) => [k, v.length])) };
}

module.exports = {
  routeServiceDeskItems,
  assignToRole,
  getRoleQueue,
  ROLES,
};
