/**
 * Cheeky OS — Orchestrated "run all" business cycle (shared by control + autopilot).
 *
 * @module cheeky-os/engine/run-all
 */

console.log("🔥 RUN-ALL.JS RUNNING");
const { fetchSafe } = require("../utils/fetchSafe");

function getBaseUrl() {
  return process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
}

async function callEndpoint(name, endpoint, opts = {}) {
  const base = getBaseUrl();
  const url = `${base}${endpoint}`;
  console.log("[AUTOPILOT] Calling:", url);
  try {
    const response = await fetchSafe(url, opts);
    let result = response.ok
      ? (response.data && response.data.ok !== undefined
        ? response.data
        : { ok: true, data: response.data, error: null })
      : { ok: false, data: null, error: `Failed at ${endpoint}: ${response.error}` };
    if (result && result.ok === false) {
      const rawError = String(result.error || "unknown error");
      const normalized = rawError.replace(/fetch failed/gi, "upstream unavailable");
      result = { ok: false, data: result.data || null, error: `Failed at ${endpoint}: ${normalized}` };
    }
    console.log("[AUTOPILOT RESULT]", { name, ok: result.ok });
    return result;
  } catch (err) {
    console.log("[AUTOPILOT RESULT]", { name, ok: false });
    return {
      ok: false,
      data: null,
      error: `Failed at ${endpoint}: ${err.message}`,
    };
  }
}

/**
 * Run followups, cash, pipeline, leads, and production queue in one pass.
 * @returns {Promise<{ ok: boolean, data: object, error: null }>}
 */
async function runAllSystems() {
  const data = {};
  const followupOpen = await callEndpoint("followups_open", "/cheeky/followup2/open");
  const followupRun = await callEndpoint("followups_run", "/cheeky/followup2/run", { method: "POST" });
  data.followups = {
    ok: !!(followupOpen.ok && followupRun.ok),
    data: { open: followupOpen.data, run: followupRun.data },
    error: followupOpen.ok && followupRun.ok
      ? null
      : [followupOpen.error, followupRun.error].filter(Boolean).join(" | "),
  };
  //TEMP: disable unstable modules
  //data.cash = await callEndpoint("cash", "/cheeky/data/snapshot");
  //data.leads = await callEndpoint("leads", "/cheeky/data/deals/open");
  //data.queue = await callEndpoint("queue", "/cheeky/data/events");
  //data.pipeline = await callEndpoint("pipeline", "/cheeky/data/snapshot");

  const ok = Object.values(data).every((r) => r && r.ok);
  return { ok, data, error: null };
}

module.exports = { runAllSystems };
