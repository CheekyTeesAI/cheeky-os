"use strict";

/**
 * @param {import('./processManifestor').generateProcessManifest} manifest
 * @param {ReturnType<import('./flowBuilder').buildFlowFromManifest>} flow
 */
function generateCursorBuildPrompt(manifest, flow) {
  const m = manifest || {};
  const f = flow || {};
  const title = `CHEEKY OS — implement intent "${m.intent || "unknown"}"`;

  const body = [
    "## Mode",
    "ADDITIVE ONLY | COMMONJS | FAIL CLOSED | No auto-execution of generated code in prod",
    "",
    "## Intent",
    String(m.intent || ""),
    "",
    "## Missing capabilities",
    ...(m.missingCapabilities || []).map((x) => `- ${x}`),
    "",
    "## Suggested new/updated files (server)",
    "- `email-intake/cheeky-os/src/services/...` (only what is required)",
    "- `email-intake/cheeky-os/src/routes/...` (if new HTTP entry)",
    "- `src/services/...` policy/audit as needed",
    "- Prisma only if a real persistent field is required (migration + generate)",
    "",
    "## Endpoints to expose (if any)",
    ...(m.requiredRoutes || []).map((r) => `- ${r}`),
    "",
    "## Flow reference",
    `- flowId: ${f.flowId || "n/a"}`,
    `- stages: ${(f.stages || []).join(" → ")}`,
    "",
    "## Policies & verification",
    "- [ ] followupPolicy / followup safety",
    "- [ ] actionAudit on each automated step",
    "- [ ] no infinite loops: cooldowns + idempotency keys",
    "- [ ] integration test: call plan route → approve → status verified before enable",
    "- [ ] do not enable auto-send in prod without explicit operator env flags",
    "",
    "## Prohibited",
    "- No immediate deploy or background shell from this build",
    "- No Square charge / vendor purchase / unsupervised email without existing guarded paths",
    "",
  ].join("\n");

  return {
    title,
    text: `${title}\n\n${body}`,
  };
}

module.exports = {
  generateCursorBuildPrompt,
};
