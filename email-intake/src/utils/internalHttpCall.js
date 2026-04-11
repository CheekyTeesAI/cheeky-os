"use strict";

function getBaseUrl() {
  const port = Number(process.env.PORT || 3000);
  return `http://127.0.0.1:${port}`;
}

async function internalHttpCall(routePath, options) {
  const method = (options && options.method) || "POST";
  const body = (options && options.body) || {};
  const apiKey = encodeURIComponent((process.env.API_KEY || "").trim());
  const joiner = routePath.includes("?") ? "&" : "?";
  const url = `${getBaseUrl()}${routePath}${joiner}apikey=${apiKey}`;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_e) {
      data = { raw: text };
    }
    if (!res.ok) {
      return {
        success: false,
        httpStatus: res.status,
        error: `HTTP_${res.status}`,
        data
      };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: "INTERNAL_HTTP_CALL_FAILED",
      message: err instanceof Error ? err.message : String(err)
    };
  }
}

module.exports = { internalHttpCall };
