/**
 * Twilio phone intake webhook.
 * POST /api/phone/incoming
 */

const express = require("express");
const path = require("path");
const { fetchSafe } = require("../utils/fetchSafe");
const salesAgent = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "phoneSalesAgentService.js"
));

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

function escXml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(parts) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join("")}</Response>`;
}

function getBaseUrl() {
  const port = Number(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000);
  return `http://127.0.0.1:${port}`;
}

async function sendToAiExecute(phone, message) {
  const cmd = `New customer inquiry: ${message} from ${phone}`;
  const url = `${getBaseUrl()}/api/ai/execute`;
  const headers = { "Content-Type": "application/json" };
  const key = String(process.env.AI_API_KEY || "").trim();
  if (key) headers["x-api-key"] = key;

  const r = await fetchSafe(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ command: cmd }),
    timeoutMs: 12000,
  });
  if (r.ok) return r;

  // Soft fallback so intake still reaches operator flow if AI execute auth is unavailable.
  return fetchSafe(`${getBaseUrl()}/api/operator/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: cmd }),
    timeoutMs: 12000,
  });
}

async function captureLead(phone, message, payload) {
  return fetchSafe(`${getBaseUrl()}/leads/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      name: payload && payload.customer ? payload.customer.name || "Phone Caller" : "Phone Caller",
      email: payload && payload.customer ? payload.customer.email || "" : "",
      message,
      source: "phone_call",
      fit: payload && payload.fit ? payload.fit : "good",
    }),
    timeoutMs: 8000,
  });
}

const callState = new Map();

function gatherTwiml(question) {
  return twiml([
    `<Gather input="speech dtmf" action="/api/phone/incoming" method="POST" speechTimeout="auto" timeout="5" numDigits="12">`,
    `<Say>${escXml(question)}</Say>`,
    "</Gather>",
    "<Say>Sorry, I did not catch that. Please call again and we can get your estimate moving.</Say>",
    "<Hangup/>",
  ]);
}

function closeTwiml(lines) {
  const parts = (lines || []).map((l) => `<Say>${escXml(l)}</Say>`);
  parts.push("<Hangup/>");
  return twiml(parts);
}

router.post("/incoming", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const callSid = String(body.CallSid || "").trim() || `call-${Date.now()}`;
  const from = String(body.From || body.Caller || "").trim() || "unknown";
  const speech = String(body.SpeechResult || "").trim();
  const digits = String(body.Digits || "").trim();
  const captured = speech || (digits ? `DTMF:${digits}` : "");
  let state = callState.get(callSid);
  if (!state) {
    state = salesAgent.createInitialState(from);
    callState.set(callSid, state);
  }

  // First hit from Twilio: warm greeting + first question.
  if (!captured) {
    const response = gatherTwiml(
      `${salesAgent.nowGreeting()} Let me get a few details so we can put together an estimate. ${salesAgent.questionForField("project.garmentType")}`
    );
    res.type("text/xml").send(response);
    return;
  }

  state = salesAgent.ingestUtterance(state, captured);
  const spam = salesAgent.detectSpamOrUnfit(captured);
  if (spam) {
    state.fit = "spam";
  }

  if (state.fit === "spam") {
    callState.delete(callSid);
    const response = closeTwiml([
      "No thank you, we're all set on that. Have a good day.",
    ]);
    res.type("text/xml").send(response);
    return;
  }

  const payload = salesAgent.completePayload(state);
  if (payload.fit === "small-order-redirect") {
    callState.delete(callSid);
    const response = closeTwiml([
      "For onesies and twosies, I'd probably point you to I Declare on Main Street in Fountain Inn. They're usually a better fit for those very small quantities.",
      "Thanks for calling Cheeky Tees.",
    ]);
    res.type("text/xml").send(response);
    return;
  }

  if (!salesAgent.shouldFinalize(state) && state.turnCount < 12) {
    const next = salesAgent.missingField(state);
    const recommendation = salesAgent.spokenRecommendation(state);
    const question = salesAgent.questionForField(next);
    const prompt = recommendation ? `${recommendation} ${question}` : question;
    res.type("text/xml").send(gatherTwiml(prompt));
    return;
  }

  try {
    await Promise.all([
      sendToAiExecute(from, JSON.stringify(payload)),
      captureLead(
        from,
        `Phone intake: ${payload.project.garmentType}, qty ${payload.project.quantity}, print ${payload.project.printDescription}, locations ${payload.project.printLocations}, art ${payload.project.artProvided ? "provided" : "not provided"}, colors ${payload.project.inkColors}, deadline ${payload.project.deadline}`,
        payload
      ),
    ]);
    try {
      if (typeof memoryService.logEvent === "function") {
        memoryService.logEvent("phone_inquiry_captured", {
          phone: from,
          payload,
          agentPrompt: salesAgent.AGENT_PROMPT,
        });
      }
    } catch (_) {}
  } catch (err) {
    console.error("[phone/incoming]", err instanceof Error ? err.message : err);
    try {
      if (typeof memoryService.logEvent === "function") {
        memoryService.logEvent("phone_inquiry_error", {
          phone: from,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } catch (_) {}
  }
  callState.delete(callSid);

  const response = closeTwiml([
    "Perfect, I've got what I need to move this forward.",
    "We can get that started with an estimate and keep the ball moving forward.",
    "Got it. We'll follow up with you shortly.",
  ]);
  res.type("text/xml").send(response);
});

module.exports = router;
