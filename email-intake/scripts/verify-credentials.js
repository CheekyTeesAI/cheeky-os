/**
 * Credential Verification Script — Cheeky OS
 * Tests every required .env variable and validates live connections.
 * Run as: node scripts/verify-credentials.js
 *
 * Checks: Dataverse, Graph API, OpenAI, Square, Teams, Webhook Server
 * Each check reports PASS or FAIL with reason.
 *
 * @module scripts/verify-credentials
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const http = require("http");

// ── Results accumulator ─────────────────────────────────────────────────────
const results = {};

/**
 * Record a pass result for a service.
 * @param {string} service - Service name.
 * @param {string} [detail] - Optional detail message.
 */
function pass(service, detail) {
  results[service] = { status: "PASS", detail: detail || "" };
}

/**
 * Record a fail result for a service.
 * @param {string} service - Service name.
 * @param {string} reason  - Reason for failure.
 */
function fail(service, reason) {
  results[service] = { status: "FAIL", reason };
}

/**
 * Make a simple HTTP GET request and return { ok, status, body }.
 * @param {string} url - Full URL to request.
 * @param {number} [timeoutMs=10000] - Timeout in milliseconds.
 * @returns {Promise<{ok: boolean, status: number, body: string}>}
 */
function httpGet(url, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  return new Promise(function (resolve) {
    try {
      var timeout = setTimeout(function () {
        resolve({ ok: false, status: 0, body: "Request timed out" });
      }, timeoutMs);
      var req = http.get(url, function (res) {
        clearTimeout(timeout);
        var data = "";
        res.on("data", function (chunk) { data += chunk; });
        res.on("end", function () {
          resolve({ ok: res.statusCode === 200, status: res.statusCode, body: data });
        });
      });
      req.on("error", function (err) {
        clearTimeout(timeout);
        resolve({ ok: false, status: 0, body: err.message });
      });
    } catch (err) {
      resolve({ ok: false, status: 0, body: err.message });
    }
  });
}

// ── CHECK: Dataverse ────────────────────────────────────────────────────────
/**
 * Verify Dataverse credentials by attempting an OAuth token fetch.
 */
async function checkDataverse() {
  var url = process.env.DATAVERSE_URL;
  var tenantId = process.env.DATAVERSE_TENANT_ID;
  var clientId = process.env.DATAVERSE_CLIENT_ID;
  var clientSecret = process.env.DATAVERSE_CLIENT_SECRET;

  if (!url) { fail("DATAVERSE", "DATAVERSE_URL not set"); return; }
  if (!tenantId) { fail("DATAVERSE", "DATAVERSE_TENANT_ID not set"); return; }
  if (!clientId) { fail("DATAVERSE", "DATAVERSE_CLIENT_ID not set"); return; }
  if (!clientSecret) { fail("DATAVERSE", "DATAVERSE_CLIENT_SECRET not set"); return; }

  try {
    var tokenUrl = "https://login.microsoftonline.com/" + tenantId + "/oauth2/v2.0/token";
    var body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: url + "/.default",
    });
    var res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (res.ok) {
      var data = await res.json();
      if (data.access_token) {
        pass("DATAVERSE", "Token acquired (" + data.access_token.slice(0, 20) + "...)");
      } else {
        fail("DATAVERSE", "Token response missing access_token");
      }
    } else {
      var errText = await res.text();
      fail("DATAVERSE", "Token request failed (" + res.status + "): " + errText.slice(0, 200));
    }
  } catch (err) {
    fail("DATAVERSE", "Token fetch error: " + err.message);
  }
}

// ── CHECK: Graph API / Outlook ──────────────────────────────────────────────
/**
 * Verify Graph API credentials by attempting to fetch unread emails.
 */
async function checkGraphAPI() {
  var email = process.env.OUTLOOK_USER_EMAIL;
  var tenantId = process.env.AZURE_TENANT_ID;
  var clientId = process.env.AZURE_CLIENT_ID;
  var clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!email) { fail("GRAPH API", "OUTLOOK_USER_EMAIL not set"); return; }
  if (!tenantId) { fail("GRAPH API", "AZURE_TENANT_ID not set"); return; }
  if (!clientId) { fail("GRAPH API", "AZURE_CLIENT_ID not set"); return; }
  if (!clientSecret) { fail("GRAPH API", "AZURE_CLIENT_SECRET not set"); return; }

  try {
    // Get token
    var tokenUrl = "https://login.microsoftonline.com/" + tenantId + "/oauth2/v2.0/token";
    var body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    });
    var tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      var errText = await tokenRes.text();
      fail("GRAPH API", "Token failed (" + tokenRes.status + "): " + errText.slice(0, 200));
      return;
    }
    var tokenData = await tokenRes.json();

    // Test mail access
    var mailUrl = "https://graph.microsoft.com/v1.0/users/" + email + "/mailFolders/Inbox/messages?$top=1&$select=id,subject";
    var mailRes = await fetch(mailUrl, {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    if (mailRes.ok) {
      var mailData = await mailRes.json();
      var count = (mailData.value || []).length;
      pass("GRAPH API", "Connected to " + email + " inbox (" + count + " messages sampled)");
    } else {
      var mailErr = await mailRes.text();
      fail("GRAPH API", "Mail access failed (" + mailRes.status + "): " + mailErr.slice(0, 200));
    }
  } catch (err) {
    fail("GRAPH API", "Connection error: " + err.message);
  }
}

// ── CHECK: OpenAI ───────────────────────────────────────────────────────────
/**
 * Verify OpenAI API key by sending a test prompt.
 */
async function checkOpenAI() {
  var apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { fail("OPENAI", "OPENAI_API_KEY not set"); return; }

  try {
    var res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: "Reply with the word READY only." },
          { role: "user", content: "Are you ready?" },
        ],
        max_tokens: 10,
      }),
    });
    if (res.ok) {
      var data = await res.json();
      var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      pass("OPENAI", "Model responded: " + reply.trim().slice(0, 50));
    } else {
      var errText = await res.text();
      fail("OPENAI", "API call failed (" + res.status + "): " + errText.slice(0, 200));
    }
  } catch (err) {
    fail("OPENAI", "Connection error: " + err.message);
  }
}

// ── CHECK: Square ───────────────────────────────────────────────────────────
/**
 * Verify Square credentials by calling the /v2/locations endpoint.
 */
async function checkSquare() {
  var token = process.env.SQUARE_ACCESS_TOKEN;
  var locationId = process.env.SQUARE_LOCATION_ID;
  var env = process.env.SQUARE_ENVIRONMENT || "sandbox";

  if (!token) { fail("SQUARE", "SQUARE_ACCESS_TOKEN not set"); return; }
  if (!locationId) { fail("SQUARE", "SQUARE_LOCATION_ID not set"); return; }

  try {
    var baseUrl = env === "production"
      ? "https://connect.squareup.com/v2"
      : "https://connect.squareupsandbox.com/v2";
    var res = await fetch(baseUrl + "/locations", {
      headers: {
        Authorization: "Bearer " + token,
        "Square-Version": "2024-12-18",
      },
    });
    if (res.ok) {
      var data = await res.json();
      var locs = (data.locations || []).length;
      var found = (data.locations || []).some(function (l) { return l.id === locationId; });
      if (found) {
        pass("SQUARE", env + " mode — " + locs + " location(s), target location verified");
      } else {
        fail("SQUARE", "Token works but SQUARE_LOCATION_ID '" + locationId + "' not found in " + locs + " locations");
      }
    } else {
      var errText = await res.text();
      fail("SQUARE", "API call failed (" + res.status + "): " + errText.slice(0, 200));
    }
  } catch (err) {
    fail("SQUARE", "Connection error: " + err.message);
  }
}

// ── CHECK: Teams Webhook ────────────────────────────────────────────────────
/**
 * Verify Teams webhook by sending a test message.
 */
async function checkTeams() {
  var webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) { fail("TEAMS", "TEAMS_WEBHOOK_URL not set"); return; }

  try {
    var payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: "00CC00",
      summary: "Cheeky OS Credential Check",
      sections: [{
        activityTitle: "✅ Cheeky OS Credential Check",
        activitySubtitle: new Date().toISOString(),
        text: "Cheeky OS credential check — system online and verified.",
      }],
    };
    var res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      pass("TEAMS", "Test message sent successfully");
    } else {
      var errText = await res.text();
      fail("TEAMS", "Webhook failed (" + res.status + "): " + errText.slice(0, 200));
    }
  } catch (err) {
    fail("TEAMS", "Webhook error: " + err.message);
  }
}

// ── CHECK: Webhook Server ───────────────────────────────────────────────────
/**
 * Verify the webhook server by starting it temporarily and pinging /health.
 */
async function checkWebhookServer() {
  var port = parseInt(process.env.PORT, 10) || 3000;

  // First try pinging in case the server is already running
  var pingResult = await httpGet("http://127.0.0.1:" + port + "/health");
  if (pingResult.ok) {
    pass("WEBHOOK", "Server already running on port " + port + " — /health responded OK");
    return;
  }

  // Server not running — start it temporarily
  try {
    var serverMod = require("../webhook/server");
    await serverMod.startServer();

    // Wait a moment for the server to be fully ready
    await new Promise(function (r) { setTimeout(r, 500); });

    var result = await httpGet("http://127.0.0.1:" + port + "/health");
    await serverMod.stopServer();

    if (result.ok) {
      pass("WEBHOOK", "Server started on port " + port + ", /health returned 200");
    } else {
      fail("WEBHOOK", "/health returned " + result.status + ": " + result.body.slice(0, 200));
    }
  } catch (err) {
    fail("WEBHOOK", "Server start error: " + err.message);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
/**
 * Run all credential checks and print the summary table.
 */
async function main() {
  console.log("");
  console.log("═".repeat(60));
  console.log("  🔐 CHEEKY OS — Credential Verification");
  console.log("  " + new Date().toISOString());
  console.log("═".repeat(60));
  console.log("");

  // Run all checks
  console.log("  ⏳ Checking Dataverse...");
  await checkDataverse();

  console.log("  ⏳ Checking Graph API / Outlook...");
  await checkGraphAPI();

  console.log("  ⏳ Checking OpenAI...");
  await checkOpenAI();

  console.log("  ⏳ Checking Square...");
  await checkSquare();

  console.log("  ⏳ Checking Teams Webhook...");
  await checkTeams();

  console.log("  ⏳ Checking Webhook Server...");
  await checkWebhookServer();

  // Print summary table
  console.log("");
  console.log("═".repeat(60));
  console.log("  📊 CREDENTIAL CHECK RESULTS");
  console.log("═".repeat(60));
  console.log("");

  var services = ["DATAVERSE", "GRAPH API", "OPENAI", "SQUARE", "TEAMS", "WEBHOOK"];
  var passing = 0;
  var total = services.length;

  for (var i = 0; i < services.length; i++) {
    var svc = services[i];
    var r = results[svc];
    var pad = svc + " ".repeat(15 - svc.length);
    if (r && r.status === "PASS") {
      console.log("  " + pad + "[ PASS ]" + (r.detail ? " — " + r.detail : ""));
      passing++;
    } else if (r) {
      console.log("  " + pad + "[ FAIL ] — " + r.reason);
    } else {
      console.log("  " + pad + "[ SKIP ] — not checked");
    }
  }

  console.log("");
  console.log("─".repeat(60));
  console.log("  TOTAL: " + passing + "/" + total + " passing");
  console.log("─".repeat(60));

  if (passing === total) {
    console.log("");
    console.log("  ✅ ALL CREDENTIALS VERIFIED.");
    console.log("  System is ready for live order test.");
    console.log("");
  } else {
    console.log("");
    console.log("  ⚠️  Fix the failing checks above before running");
    console.log("  a live order test.");
    console.log("  See: scripts/credential-setup-guide.md");
    console.log("");
  }

  process.exit(passing === total ? 0 : 1);
}

main();
