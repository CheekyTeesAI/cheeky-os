"use strict";

const path = require("path");
const axios = require("axios");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

require("../lib/config");
const { parseCommand } = require("../lib/commandParser");
const { createDraftEstimate } = require("../lib/integrations/square");
const { sendEmail } = require("../lib/integrations/outlook");

const API_PORT = Number(process.env.PORT || 3000);
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const estimateCommandInput =
  "create estimate for ray thompson karate for 50 shirts";

const otherSamples = [
  "send test email hello from cheeky os",
  "send follow up email to goodman mills offering embroidered polos",
  "create task to review unpaid estimates over 500",
];

async function checkHealth() {
  try {
    const res = await axios.get(`${API_BASE}/health`, {
      timeout: 5000,
      validateStatus: () => true,
    });
    return (
      res.status === 200 &&
      res.data &&
      typeof res.data === "object" &&
      res.data.status === "ok"
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} input
 */
async function runCommand(input) {
  const res = await axios.post(
    `${API_BASE}/api/command`,
    { input },
    { validateStatus: () => true, timeout: 120000 }
  );
  console.log(JSON.stringify(res.data, null, 2));
  return res.data;
}

(async () => {
  const ok = await checkHealth();
  console.log("1. API status:", ok ? "ok (reachable)" : "unreachable");
  if (!ok) {
    console.log("API NOT RUNNING — START WITH: npm run dev");
    process.exit(1);
  }

  let squareLabel = "failed";
  let emailLabel = "failed";

  console.log("\n---- DIRECT TEST START ----");

  console.log("\n2. Parsed command (estimate sample):");
  const parsedEstimate = parseCommand(estimateCommandInput);
  console.log(JSON.stringify(parsedEstimate, null, 2));

  console.log("\n3. Square result (direct createDraftEstimate):");
  try {
    const directPayload = {
      firstName: "Test",
      lastName: "Customer",
      email: String(process.env.DEFAULT_FROM_EMAIL || "").trim(),
      items: [
        {
          name: "Test Shirts",
          quantity: 10,
          unitAmount: 20,
        },
      ],
      note: "Direct test from Cheeky OS",
    };
    const direct = await createDraftEstimate(directPayload);
    console.log(JSON.stringify(direct, null, 2));
    if (direct && direct.success === true) squareLabel = "ok";
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("Square threw:", err.message);
  }

  console.log("\n4. Email result (direct sendEmail):");
  try {
    const to = String(process.env.DEFAULT_FROM_EMAIL || "").trim();
    const mail = await sendEmail({
      to,
      subject: "Cheeky OS Direct Test",
      body: "If you see this, email system is working.",
    });
    console.log(JSON.stringify(mail, null, 2));
    if (mail && mail.success === true) emailLabel = "ok";
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("Email threw:", err.message);
  }

  console.log("\n5. HTTP — POST /api/command (estimate):");
  try {
    const res = await axios.post(
      `${API_BASE}/api/command`,
      { input: estimateCommandInput },
      { validateStatus: () => true, timeout: 120000 }
    );
    console.log("status:", res.status);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("HTTP estimate error:", err.message);
  }

  console.log("\n6. HTTP — other samples:");
  for (const input of otherSamples) {
    try {
      const res = await axios.post(
        `${API_BASE}/api/command`,
        { input },
        { validateStatus: () => true, timeout: 120000 }
      );
      console.log("\ninput:", JSON.stringify(input));
      console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error("ERROR:", input, err.message);
    }
  }

  console.log("\n=== INTAKE — create estimate hillcrest baseball 48 shirts ===");
  try {
    const intake1 = await axios.post(
      `${API_BASE}/intake`,
      { message: "create estimate for hillcrest baseball 48 shirts" },
      { validateStatus: () => true, timeout: 120000 }
    );
    console.log(JSON.stringify(intake1.data, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("intake error:", err.message);
  }

  console.log("\n=== INTAKE — email follow up ray thompson karate ===");
  try {
    const intake2 = await axios.post(
      `${API_BASE}/intake`,
      { message: "send email follow up to ray thompson karate" },
      { validateStatus: () => true, timeout: 120000 }
    );
    console.log(JSON.stringify(intake2.data, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("intake2 error:", err.message);
  }

  console.log("\n=== GET /tasks ===");
  try {
    const tr = await axios.get(`${API_BASE}/tasks`, { validateStatus: () => true });
    console.log(JSON.stringify(tr.data, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("/tasks error:", err.message);
  }

  console.log("\n=== GET /tasks/metrics ===");
  try {
    const mr = await axios.get(`${API_BASE}/tasks/metrics`, {
      validateStatus: () => true,
    });
    console.log(JSON.stringify(mr.data, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("/tasks/metrics error:", err.message);
  }

  console.log("\n=== GET /tasks/events ===");
  try {
    const er = await axios.get(`${API_BASE}/tasks/events?limit=20`, {
      validateStatus: () => true,
    });
    console.log(JSON.stringify(er.data, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("/tasks/events error:", err.message);
  }

  console.log("\n=== GET /tasks/intake ===");
  try {
    const ir = await axios.get(`${API_BASE}/tasks/intake?limit=20`, {
      validateStatus: () => true,
    });
    console.log(JSON.stringify(ir.data, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("/tasks/intake error:", err.message);
  }

  console.log("\n=== AUTO INTAKE (legacy /api/command samples) ===");
  try {
    await runCommand("create estimate for goodman mills 48 shirts");
    await runCommand("send email follow up to ray thompson karate");
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("AUTO INTAKE HTTP error:", err.message);
  }

  const summary = {
    square: squareLabel,
    email: emailLabel,
    api: "connected",
  };
  console.log("\nFINAL SUMMARY:", JSON.stringify(summary, null, 2));
  console.log("Server running: yes (health passed)");
  console.log("Health OK: yes");
  console.log("CHEEKY OS AUTO INTAKE READY");
})();
