/**
 * Root entry for hosts (e.g. Render) that start the repo from repository root.
 * Production HTTP surface: email-intake/cheeky-os/server.js (Express).
 */
console.log("[boot] entry=render-http.js");
console.log("[boot] load=./email-intake/cheeky-os/server.js");

try {
  require("./email-intake/cheeky-os/server.js");
} catch (err) {
  const msg = err && err.message ? err.message : String(err);
  console.error("[boot] fatal: failed to load cheeky-os/server.js:", msg);
  process.exit(1);
}
