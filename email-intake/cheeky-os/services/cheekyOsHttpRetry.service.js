"use strict";

/**
 * CHEEKY OS v3.2 — Transient-aware HTTP retries for Square, OpenAI, and misc APIs.
 *
 * CHEEKY_HTTP_RETRY_ATTEMPTS (default 3)
 * CHEEKY_HTTP_RETRY_INITIAL_MS (default 250)
 */

const { fetchSafe } = require("../utils/fetchSafe");

function httpStatusFromError(errStr) {
  const m = String(errStr || "").match(/\bHTTP\s+(\d{3})\b/i);
  return m ? parseInt(m[1], 10) : NaN;
}

/** True when a retry may help (not for 400/404/422 etc.). */
function isTransientFetchFailure(result) {
  if (!result || result.ok) return false;
  const err = String(result.error || "");
  const st = httpStatusFromError(err);
  if (Number.isFinite(st)) {
    if (st === 429) return true;
    if (st >= 502 && st <= 504) return true;
    if (st === 408) return true;
    return false;
  }
  if (/timed out|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(err)) {
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function bumpRetryMetric() {
  try {
    require("./cheekyOsRuntimeObservability.service").recordExternalRetry();
  } catch (_) {}
}

/**
 * Wraps fetchSafe with bounded retries on transient failures.
 * @param {string} url
 * @param {object} opts fetch options (+ timeoutMs)
 * @param {{ label?: string }} meta
 */
async function fetchSafeTransientRetry(url, opts = {}, meta = {}) {
  const label = (meta.label && String(meta.label)) || "http";
  let max = parseInt(String(process.env.CHEEKY_HTTP_RETRY_ATTEMPTS || "3"), 10);
  if (!Number.isFinite(max) || max < 1) max = 3;
  if (max > 8) max = 8;
  let delay = parseInt(String(process.env.CHEEKY_HTTP_RETRY_INITIAL_MS || "250"), 10);
  if (!Number.isFinite(delay) || delay < 50) delay = 250;

  let last = { ok: false, data: null, error: "no_attempt" };

  for (let attempt = 1; attempt <= max; attempt++) {
    last = await fetchSafe(url, opts);
    if (last.ok) return last;
    if (!isTransientFetchFailure(last) || attempt >= max) {
      return last;
    }
    bumpRetryMetric();
    try {
      const { logger } = require("../utils/logger");
      logger.warn(
        `[http-retry:${label}] attempt ${attempt}/${max} transient — ${String(last.error || "").slice(0, 260)}`
      );
    } catch (_) {}
    await sleep(delay * attempt);
  }
  return last;
}

module.exports = {
  fetchSafeTransientRetry,
  isTransientFetchFailure,
  httpStatusFromError,
};
