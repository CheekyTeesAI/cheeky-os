"use strict";

function getCheekyBaseUrl() {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || process.env.CHEEKY_OS_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const port = String(process.env.PORT || process.env.CHEEKY_OS_PORT || "3000").trim();
  return `http://127.0.0.1:${port}`;
}

function actionHeadersJson() {
  const key = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
  if (!key) return null;
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
  };
}

function actionHeadersGet() {
  const key = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
  if (!key) return null;
  return { "x-api-key": key };
}

async function pushCursorTask(input) {
  const headers = actionHeadersJson();
  if (!headers) {
    return { error: true, message: "CHATGPT_ACTION_API_KEY is not set in environment." };
  }

  const task = input && typeof input.task === "string" ? input.task.trim() : "";
  if (!task) {
    return { error: true, message: 'Missing required field "task".' };
  }

  const context = input && input.context != null ? String(input.context) : "";
  const priority =
    input && input.priority != null && String(input.priority).trim()
      ? String(input.priority).trim()
      : "normal";

  const base = getCheekyBaseUrl();
  const res = await fetch(`${base}/api/cursor/task`, {
    method: "POST",
    headers,
    body: JSON.stringify({ task, context, priority }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    return {
      error: true,
      message:
        (data && (data.error || data.message)) || `HTTP ${res.status}`,
      status: res.status,
      data,
    };
  }

  return { error: false, data };
}

async function getNextCursorTask() {
  const headers = actionHeadersGet();
  if (!headers) {
    return { error: true, message: "CHATGPT_ACTION_API_KEY is not set in environment." };
  }

  const base = getCheekyBaseUrl();
  const res = await fetch(`${base}/api/cursor/task/next`, {
    method: "GET",
    headers,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    return {
      error: true,
      message:
        (data && (data.error || data.message)) || `HTTP ${res.status}`,
      status: res.status,
      data,
    };
  }

  return { error: false, data };
}

module.exports = {
  pushCursorTask,
  getNextCursorTask,
};
