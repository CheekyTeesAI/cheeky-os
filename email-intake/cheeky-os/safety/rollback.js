/**
 * Cheeky OS — GitHub rollback via API.
 * Reverts the last commit on main using the GitHub REST API.
 * Uses GITHUB_TOKEN and GITHUB_REPO env vars.
 *
 * @module cheeky-os/safety/rollback
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

/**
 * Revert the last commit on the main branch via GitHub API.
 * Creates a force-update of the main branch ref to HEAD~1.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function rollback() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return { ok: false, data: null, error: "GITHUB_TOKEN or GITHUB_REPO not set" };
  }

  const apiBase = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  // Step 1: Get the current HEAD commit on main
  logger.info("[ROLLBACK] Fetching current HEAD on main...");
  const refResult = await fetchSafe(`${apiBase}/git/ref/heads/main`, { headers });
  if (!refResult.ok) {
    return { ok: false, data: null, error: "Failed to get main ref: " + refResult.error };
  }

  const currentSha = refResult.data.object && refResult.data.object.sha;
  if (!currentSha) {
    return { ok: false, data: null, error: "Could not read current SHA from ref" };
  }

  // Step 2: Get the parent commit (HEAD~1)
  logger.info(`[ROLLBACK] Current HEAD: ${currentSha.slice(0, 8)}`);
  const commitResult = await fetchSafe(`${apiBase}/git/commits/${currentSha}`, { headers });
  if (!commitResult.ok) {
    return { ok: false, data: null, error: "Failed to get commit: " + commitResult.error };
  }

  const parents = commitResult.data.parents;
  if (!parents || parents.length === 0) {
    return { ok: false, data: null, error: "No parent commit to roll back to (initial commit)" };
  }

  const parentSha = parents[0].sha;
  logger.info(`[ROLLBACK] Rolling back to parent: ${parentSha.slice(0, 8)}`);

  // Step 3: Force-update main to the parent SHA
  const updateResult = await fetchSafe(`${apiBase}/git/refs/heads/main`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: parentSha, force: true }),
  });

  if (!updateResult.ok) {
    return { ok: false, data: null, error: "Failed to update ref: " + updateResult.error };
  }

  logger.info(`[ROLLBACK] ✅ Rolled back main from ${currentSha.slice(0, 8)} → ${parentSha.slice(0, 8)}`);
  return {
    ok: true,
    data: { from: currentSha, to: parentSha },
    error: null,
  };
}

module.exports = { rollback };
