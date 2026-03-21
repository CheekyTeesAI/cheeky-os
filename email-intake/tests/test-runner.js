/**
 * Master test runner for the Cheeky Tees system.
 * Runs all test suites in sequence and reports results.
 *
 * Usage:
 *   node tests/test-runner.js             — run all test suites
 *   node tests/test-runner.js --all       — run all test suites (same)
 *   node tests/test-runner.js --module bridge  — run only bridge tests
 *   node tests/test-runner.js --module webhook — run only webhook tests
 *
 * Exits with code 0 if all pass, code 1 if any fail.
 *
 * @module tests/test-runner
 */

const { execSync } = require("child_process");
const path = require("path");

/** All available test modules. */
const TEST_MODULES = {
  intake: { file: "intake.test.js", label: "Intake Pipeline" },
  webhook: { file: "test-webhook.js", label: "Webhook Server" },
  square: { file: "test-square.js", label: "Square Integration" },
  bridge: { file: "test-bridge.js", label: "Bridge Commands" },
  email: { file: "test-email.js", label: "Email Listener" },
};

/**
 * Parse command-line arguments for --module and --all flags.
 * @returns {Object} Parsed options.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { modules: null, all: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") {
      options.all = true;
    } else if (args[i] === "--module" && args[i + 1]) {
      options.modules = options.modules || [];
      options.modules.push(args[i + 1]);
      i++;
    }
  }

  return options;
}

/**
 * Run a single test file using Node's built-in test runner.
 * @param {string} file  - Test file name.
 * @param {string} label - Human-readable label.
 * @returns {{ passed: boolean, output: string }}
 */
function runTestFile(file, label) {
  const filePath = path.join(__dirname, file);
  const start = Date.now();
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  🧪 Running: ${label} (${file})`);
  console.log(`${"─".repeat(60)}`);

  try {
    const output = execSync(`node --test "${filePath}"`, {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: path.join(__dirname, ".."),
      timeout: 60000, // 60 second timeout per suite
    });
    const duration = Date.now() - start;
    console.log(output);
    console.log(`  ✅ ${label} — PASSED (${duration}ms)`);
    return { passed: true, output, duration };
  } catch (err) {
    const duration = Date.now() - start;
    const output = (err.stdout || "") + (err.stderr || "");
    console.log(output);
    console.log(`  ❌ ${label} — FAILED (${duration}ms)`);
    return { passed: false, output, duration };
  }
}

/**
 * Main runner. Executes selected test suites and prints summary.
 */
function main() {
  const options = parseArgs();

  console.log("");
  console.log("═".repeat(60));
  console.log("  🧪 CHEEKY OS — Test Runner");
  console.log(`  ${new Date().toISOString()}`);
  console.log("═".repeat(60));

  // Determine which modules to run
  let modulesToRun;
  if (options.modules) {
    modulesToRun = {};
    for (const name of options.modules) {
      if (TEST_MODULES[name]) {
        modulesToRun[name] = TEST_MODULES[name];
      } else {
        console.error(`  ❌ Unknown module: "${name}"`);
        console.error(`  Available: ${Object.keys(TEST_MODULES).join(", ")}`);
        process.exit(1);
      }
    }
  } else {
    modulesToRun = TEST_MODULES;
  }

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const [name, mod] of Object.entries(modulesToRun)) {
    const result = runTestFile(mod.file, mod.label);
    results.push({ name, label: mod.label, ...result });
    if (result.passed) totalPassed++;
    else totalFailed++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("  📊 TEST SUMMARY");
  console.log("═".repeat(60));

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    console.log(`  ${icon} ${r.label.padEnd(25)} ${r.passed ? "PASSED" : "FAILED"}  (${r.duration}ms)`);
  }

  console.log("─".repeat(60));
  console.log(`  Total Suites: ${results.length}`);
  console.log(`  Passed:       ${totalPassed}`);
  console.log(`  Failed:       ${totalFailed}`);
  console.log("═".repeat(60));

  if (totalFailed > 0) {
    console.log("\n  ❌ SOME TESTS FAILED. See output above for details.\n");
    process.exit(1);
  } else {
    console.log("\n  ✅ ALL TESTS PASSED.\n");
    process.exit(0);
  }
}

main();
