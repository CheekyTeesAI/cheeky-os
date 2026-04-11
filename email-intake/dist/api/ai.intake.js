"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiIntake = aiIntake;
const openai_1 = __importDefault(require("openai"));
const pipeline_run_1 = require("./pipeline.run");
// TEMP stability: construct client on first request only (avoids OpenAI init during server boot)
let openaiClient = null;
function getOpenAI() {
    if (!openaiClient) {
        openaiClient = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openaiClient;
}
async function aiIntake(req, res) {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({
                success: false,
                error: "Missing text"
            });
        }
        let parsed;
        try {
            const completion = await getOpenAI().chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `
You are a print shop order parser.

Extract structured data from customer requests.

Return ONLY JSON in this format:

{
  "customerName": "",
  "email": "",
  "items": [
    {
      "type": "shirt|hoodie|other",
      "quantity": number,
      "description": "text"
    }
  ],
  "notes": ""
}

Do not include any extra text.
        `
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0
            });
            parsed = JSON.parse(completion.choices[0].message.content || "{}");
        }
        catch (err) {
            console.error("AI parsing failed, using fallback");
            // fallback
            const lower = text.toLowerCase();
            let items = [];
            if (lower.includes("shirt")) {
                items.push({ type: "shirt", quantity: 10, description: "shirts" });
            }
            if (lower.includes("hoodie")) {
                items.push({ type: "hoodie", quantity: 5, description: "hoodies" });
            }
            if (items.length === 0) {
                items.push({ type: "other", quantity: 1, description: "custom item" });
            }
            parsed = {
                customerName: "Fallback Customer",
                email: "",
                items,
                notes: text
            };
        }
        // RUN FULL PIPELINE
        let pipelineResult = {};
        await (0, pipeline_run_1.runPipeline)({
            body: {
                customerName: parsed.customerName,
                email: parsed.email,
                items: parsed.items.map((i) => `${i.quantity} ${i.type}`),
                notes: parsed.notes
            }
        }, {
            json: (data) => (pipelineResult = data),
            status: () => ({ json: (data) => (pipelineResult = data) })
        });
        return res.json({
            success: true,
            input: text,
            parsed,
            pipeline: pipelineResult.pipeline
        });
    }
    catch (err) {
        console.error("AI intake failed", err);
        return res.status(500).json({
            success: false,
            error: "AI intake failed"
        });
    }
}
