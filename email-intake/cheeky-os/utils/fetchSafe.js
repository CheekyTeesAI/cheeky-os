/**
 * Cheeky OS — Safe fetch wrapper. NEVER throws.
 * Wraps fetch with a timeout and consistent { ok, data, error } response.
 * Handles empty bodies and malformed JSON ("unexpected end of input").
 *
 * @module cheeky-os/utils/fetchSafe
 */

const _badJsonUrls = new Set();

function warnInvalidJsonOnce(urlSnippet, preview) {
  const key = urlSnippet || "unknown";
  if (_badJsonUrls.has(key)) return;
  _badJsonUrls.add(key);
  try {
    const { logger } = require("./logger");
    logger.warn(`[fetchSafe] Invalid or empty JSON from ${key}: ${preview}`);
  } catch {
    console.warn(`[fetchSafe] Invalid or empty JSON from ${key}: ${preview}`);
  }
}

/**
 * Parse response body safely (empty or non-JSON never throws).
 * @param {Response} res
 * @returns {Promise<any>}
 */
async function parseBodySafe(res) {
  const text = await res.text();
  if (!text || !String(text).trim()) {
    return null;
  }
  const contentType = res.headers.get("content-type") || "";
  const trimmed = String(text).trim();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (contentType.includes("application/json") || looksJson) {
    try {
      const data = JSON.parse(trimmed);
      return data;
    } catch (err) {
      warnInvalidJsonOnce(res.url, trimmed.slice(0, 120));
      return null;
    }
  }
  return text;
}

/**
 * Perform a fetch request that never throws.
 * @param {string} url  - Target URL.
 * @param {Object} [opts] - Standard fetch options (method, headers, body, etc.). Optional timeoutMs overrides default 10000.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function fetchSafe(url, opts = {}) {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs != null ? Number(opts.timeoutMs) : 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _t, ...fetchOpts } = opts;
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    clearTimeout(timer);

    let data;
    try {
      data = await parseBodySafe(res);
    } catch (e) {
      data = null;
      return { ok: false, data: null, error: e.message || "Failed to read response body" };
    }

    if (data && data._parseError) {
      return { ok: false, data: null, error: "Invalid JSON in response" };
    }

    if (!res.ok) {
      let err = `HTTP ${res.status}: ${res.statusText}`;
      try {
        if (data && typeof data === "object") {
          const em =
            typeof data.message === "string"
              ? data.message
              : data.error?.message ||
                data["odata.error"]?.message?.value ||
                (Array.isArray(data.error?.details)
                  ? data.error.details.map((d) => d.message).filter(Boolean).join("; ")
                  : "") ||
                "";
          if (em) err += ` | ${String(em).slice(0, 800)}`;
        }
      } catch (_) {
        /* ignore */
      }
      return { ok: false, data, error: err };
    }
    return { ok: true, data, error: null };
  } catch (err) {
    clearTimeout(timer);
    const message = err.name === "AbortError" ? `Request timed out (${timeoutMs / 1000}s)` : err.message;
    return { ok: false, data: null, error: message };
  }
}

/**
 * Retry fetch with exponential backoff (3 attempts by default).
 * @param {string} url
 * @param {object} [opts]
 * @param {{ maxAttempts?: number, initialDelayMs?: number }} [retryOpts]
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function fetchSafeWithRetry(url, opts = {}, retryOpts = {}) {
  const maxAttempts = retryOpts.maxAttempts != null ? retryOpts.maxAttempts : 3;
  const initialDelayMs = retryOpts.initialDelayMs != null ? retryOpts.initialDelayMs : 200;
  let last = { ok: false, data: null, error: "no attempt" };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fetchSafe(url, opts);
    if (last.ok) return last;
    if (attempt < maxAttempts) {
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return last;
}

module.exports = { fetchSafe, fetchSafeWithRetry };
