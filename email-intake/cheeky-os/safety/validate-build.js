/**
 * Cheeky OS — Build validation.
 * Runs npm build (if script exists) and jest tests before deploy.
 *
 * @module cheeky-os/safety/validate-build
 */

const { execSync } = require("child_process");
const path = require("path");

/**
 * Run build validation: npm run build (if exists) + jest --passWithNoTests.
 * @returns {{ ok: boolean, output: string }}
 */
function validateBuild() {
  const cwd = path.join(__dirname, "..", "..");
  const results = [];

  // Try npm run build (optional — skip if no build script)
  try {
    const pkg = require(path.join(cwd, "package.json"));
    if (pkg.scripts && pkg.scripts.build) {
      const buildOutput = execSync("npm run build", { cwd, encoding: "utf-8", timeout: 30000 });
      results.push("BUILD: PASS\n" + buildOutput);
    } else {
      results.push("BUILD: SKIPPED (no build script)");
    }
  } catch (err) {
    return { ok: false, output: "BUILD: FAIL\n" + (err.stdout || err.message) };
  }

  // Run jest
  try {
    const testOutput = execSync("npx jest --passWithNoTests --forceExit 2>&1", {
      cwd,
      encoding: "utf-8",
      timeout: 60000,
    });
    results.push("TESTS: PASS\n" + testOutput);
  } catch (err) {
    // jest exits non-zero on failures but still produces output
    const output = err.stdout || err.stderr || err.message;
    if (output.includes("Tests:") && !output.includes("failed")) {
      results.push("TESTS: PASS\n" + output);
    } else {
      return { ok: false, output: "TESTS: FAIL\n" + output };
    }
  }

  return { ok: true, output: results.join("\n\n") };
}

module.exports = { validateBuild };
