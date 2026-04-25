/**
 * POST /api/ai/execute — secure wrapper for operator (handleOperatorRunRequest).
 * Auth: x-api-key === process.env.AI_API_KEY (required).
 * Rate: max 10 requests / minute / process (global).
 * Log: cheeky-os/data/ai-commands.json — { entries: [...] }, newest last, capped.
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const OpenAI = require("openai");
const { handleOperatorRunRequest } = require("./operatorRun");
const skillEngine = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "skillEngine.js"
));

const router = express.Router();
router.use(express.json());

const MAX_COMMAND_LEN = 500;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

let rateWindowStart = Date.now();
let rateCount = 0;

const LOG_FILE = path.join(__dirname, "..", "data", "ai-commands.json");
const MAX_LOG_ENTRIES = 2000;

function ensureDataDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function checkRateLimit() {
  const now = Date.now();
  if (now - rateWindowStart >= RATE_WINDOW_MS) {
    rateWindowStart = now;
    rateCount = 0;
  }
  if (rateCount >= RATE_MAX) return false;
  rateCount += 1;
  return true;
}

/**
 * @param {string} message
 * @returns {Promise<{ statusCode: number, body: object }>}
 */
function invokeOperatorRun(message, skill) {
  return new Promise((resolve) => {
    const req = {
      body: {
        message: String(message),
        skill: skill || null,
      },
    };
    let settled = false;
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (settled) return;
        settled = true;
        resolve({ statusCode: res.statusCode, body: payload });
      },
    };
    Promise.resolve(handleOperatorRunRequest(req, res)).catch((err) => {
      if (settled) return;
      settled = true;
      resolve({
        statusCode: 500,
        body: {
          success: false,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    });
  });
}

function appendLog(entry) {
  try {
    ensureDataDir();
    let data = { entries: [] };
    try {
      if (fs.existsSync(LOG_FILE)) {
        const raw = fs.readFileSync(LOG_FILE, "utf8");
        data = JSON.parse(raw);
      }
    } catch (_) {
      data = { entries: [] };
    }
    if (!Array.isArray(data.entries)) data.entries = [];
    data.entries.push(entry);
    if (data.entries.length > MAX_LOG_ENTRIES) {
      data.entries = data.entries.slice(-MAX_LOG_ENTRIES);
    }
    fs.writeFileSync(LOG_FILE, JSON.stringify(data), "utf8");
  } catch (_) {
    /* never crash */
  }
}

function dryRunPreview(command) {
  const low = command.toLowerCase();
  const hints = [];
  if (/\binvoice\b|draft\b/i.test(low)) {
    hints.push("May match invoice / Square draft branch if message parses.");
  }
  if (/proof|mockup|approval/i.test(low)) {
    hints.push("May match proof/art keyword routes.");
  }
  if (/deposit|reminder|comms|communication/i.test(low)) {
    hints.push("May match customer comms routes.");
  }
  if (/work order|garment|quote|estimate|margin/i.test(low)) {
    hints.push("May match work order or quote engine routes.");
  }
  if (/reply|customer|unmatched/i.test(low)) {
    hints.push("May match customer reply / comms list routes.");
  }
  if (hints.length === 0) {
    hints.push("Will be evaluated by operator keyword router and default intent path.");
  }
  return {
    dryRun: true,
    preview: {
      commandLength: command.length,
      hints,
    },
  };
}

async function runPromptWithOpenAi(prompt, apiKey, model) {
  if (!apiKey) {
    return {
      ok: false,
      error: "AI not configured",
    };
  }
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      input: prompt,
    });
    const text =
      typeof response.output_text === "string" && response.output_text.trim()
        ? response.output_text
        : "";
    return {
      ok: true,
      model,
      text,
      response,
    };
  } catch (err) {
    const status = err && typeof err.status === "number" ? err.status : 503;
    const message =
      err && err.message ? String(err.message) : "OpenAI request failed";
    return {
      ok: false,
      status,
      error: message,
    };
  }
}

router.post("/execute", async (req, res) => {
  const promptRaw = req.body && req.body.prompt;
  if (typeof promptRaw === "string" && promptRaw.trim()) {
    const prompt = promptRaw.trim();
    // Read runtime env at request time so stale module state cannot block valid keys.
    const runtimeApiKey = String(process.env.OPENAI_API_KEY || "").trim();
    const runtimeModel =
      String(process.env.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
    const aiOut = await runPromptWithOpenAi(prompt, runtimeApiKey, runtimeModel);
    if (!aiOut.ok) {
      return res.status(aiOut.status || 503).json({
        success: false,
        error: aiOut.error || "AI not configured",
      });
    }
    appendLog({
      prompt,
      result: { text: aiOut.text, model: aiOut.model },
      timestamp: new Date().toISOString(),
      success: true,
      dryRun: false,
      mode: "prompt",
    });
    return res.json({
      success: true,
      prompt,
      model: aiOut.model,
      text: aiOut.text,
    });
  }

  const expected = process.env.AI_API_KEY;
  if (!expected || !String(expected).trim()) {
    return res.status(503).json({
      success: false,
      error: "AI_API_KEY not configured",
    });
  }

  const key = String(req.headers["x-api-key"] || "").trim();
  if (key !== String(expected).trim()) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  if (!checkRateLimit()) {
    return res.status(429).json({
      success: false,
      error: "Rate limit exceeded",
    });
  }

  const raw = req.body && req.body.command;
  if (raw === undefined || raw === null) {
    return res.status(400).json({
      success: false,
      error: "command is required",
    });
  }
  if (typeof raw !== "string") {
    return res.status(400).json({
      success: false,
      error: "command must be a string",
    });
  }

  const command = raw.trim();
  if (!command) {
    return res.status(400).json({
      success: false,
      error: "command must not be empty",
    });
  }
  if (command.length > MAX_COMMAND_LEN) {
    return res.status(400).json({
      success: false,
      error: `command exceeds ${MAX_COMMAND_LEN} characters`,
    });
  }

  const dryRun = Boolean(req.body && req.body.dryRun === true);
  const executedAt = new Date().toISOString();
  const skill = skillEngine.selectSkill(command);

  try {
    if (dryRun) {
      const result = dryRunPreview(command);
      const payload = {
        success: true,
        command,
        skill,
        result,
        executedAt,
      };
      appendLog({
        command,
        result,
        skill,
        timestamp: executedAt,
        success: true,
        dryRun: true,
      });
      return res.json(payload);
    }

    const op = await invokeOperatorRun(command, skill);
    const operatorBody =
      op.body && typeof op.body === "object" ? op.body : {};
    const httpOk = op.statusCode >= 200 && op.statusCode < 300;

    appendLog({
      command,
      skill,
      result: operatorBody,
      timestamp: executedAt,
      success: httpOk,
      dryRun: false,
    });

    if (!httpOk) {
      return res.status(op.statusCode).json({
        success: false,
        command,
        skill,
        result: operatorBody,
        executedAt,
        error:
          (operatorBody && (operatorBody.message || operatorBody.error)) ||
          "Operator error",
      });
    }

    return res.json({
      success: true,
      command,
      skill,
      result: operatorBody,
      executedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog({
      command,
      skill,
      result: { error: msg },
      timestamp: executedAt,
      success: false,
      dryRun: false,
    });
    return res.status(500).json({
      success: false,
      error: msg,
      command,
      skill,
      executedAt,
    });
  }
});

module.exports = router;
