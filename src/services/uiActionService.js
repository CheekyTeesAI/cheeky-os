/**
 * Maps operator action keys → HTTP method + path (+ notes for body shape).
 * UI sends: method, path, body (JSON). Paths are root-relative on the API host.
 */

const ACTION_MAP = {
  TASK_START: { method: "POST", path: "/tasks/start", bodyKeys: ["taskId"] },
  TASK_COMPLETE: { method: "POST", path: "/tasks/complete", bodyKeys: ["taskId"] },
  TASK_FLAG: { method: "POST", path: "/tasks/flag", bodyKeys: ["taskId", "reason"] },
  JOB_STATUS: { method: "POST", path: "/jobs/status", bodyKeys: ["jobId", "status"] },
  COMM_PREVIEW: { method: "POST", path: "/communications/preview", bodyKeys: ["templateKey", "relatedType", "relatedId", "channel"] },
  COMM_SEND: { method: "POST", path: "/communications/send", bodyKeys: ["templateKey", "relatedType", "relatedId", "channel", "mode", "confirmSend"] },
  SERVICE_DESK_ASSIGN: { method: "POST", pathTemplate: "/service-desk/:id/assign", bodyKeys: ["assignedToRole", "assignedToUserId"], idKey: "serviceDeskId" },
  SERVICE_DESK_CLOSE: { method: "POST", pathTemplate: "/service-desk/:id/close", bodyKeys: [], idKey: "serviceDeskId" },
  SERVICE_DESK_SEND: { method: "POST", pathTemplate: "/service-desk/:id/send-response", bodyKeys: ["mode"], idKey: "serviceDeskId" },
  VENDOR_SEND: { method: "POST", path: "/vendor/outbound/send", bodyKeys: ["poNumber", "mode", "approvalId"] },
  APPROVE_SEND: { method: "POST", path: "/communications/approve-send", bodyKeys: ["communicationId"] },
  VENDOR_APPROVE: { method: "POST", path: "/vendor/outbound/approve", bodyKeys: ["approvalId"] },
  JOB_PATCH: { method: "PATCH", pathTemplate: "/jobs/:id", bodyKeys: ["hasArt", "artReady", "notes"], idKey: "jobId" },
};

function resolvePath(actionKey, params) {
  const def = ACTION_MAP[actionKey];
  if (!def) return null;
  const p = params && typeof params === "object" ? params : {};
  if (def.pathTemplate && def.idKey) {
    const id = p[def.idKey];
    if (!id) return null;
    return def.pathTemplate.replace(":id", encodeURIComponent(String(id)));
  }
  return def.path || null;
}

function describeAction(actionKey) {
  return ACTION_MAP[actionKey] || null;
}

function buildButtonPayload(actionKey, params) {
  const def = ACTION_MAP[actionKey];
  if (!def) return null;
  const p = params && typeof params === "object" ? params : {};
  const body = {};
  if (def.bodyKeys) {
    for (const k of def.bodyKeys) {
      if (p[k] !== undefined && p[k] !== null) body[k] = p[k];
    }
  }
  const path = resolvePath(actionKey, p);
  if (!path) return null;
  return {
    action: actionKey,
    method: def.method || "POST",
    path,
    body: Object.keys(body).length ? body : {},
  };
}

module.exports = {
  ACTION_MAP,
  resolvePath,
  describeAction,
  buildButtonPayload,
};
