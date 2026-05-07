import { Request, Response } from "express";
import OpenAI from "openai";
import { buildAiIntakeParseResult } from "../lib/aiIntakeParser";
import {
  normalizeAiIntake,
  toCreateOrderPipelineBody,
} from "../lib/intakeNormalizer";
import { runPipeline } from "./pipeline.run";

// TEMP stability: construct client on first request only (avoids OpenAI init during server boot)
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

export async function aiIntake(req: Request, res: Response) {
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

    } catch (err) {
      console.error("AI parsing failed, using fallback");

      // fallback
      const lower = text.toLowerCase();
      let items: any[] = [];

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

    const intakeParse = buildAiIntakeParseResult({
      source: "ai",
      rawText: text,
      parsedAiJson: parsed,
    });

    const normalized = normalizeAiIntake(parsed, text);
    const pipelineBody = toCreateOrderPipelineBody(normalized);

    // RUN FULL PIPELINE
    let pipelineResult: any = {};

    await runPipeline(
      {
        body: pipelineBody,
      } as any,
      {
        json: (data: any) => (pipelineResult = data),
        status: () => ({ json: (data: any) => (pipelineResult = data) })
      } as any
    );

    return res.json({
      success: true,
      input: text,
      parsed,
      intakeParse,
      pipeline: pipelineResult.pipeline,
    });

  } catch (err) {
    console.error("AI intake failed", err);

    return res.status(500).json({
      success: false,
      error: "AI intake failed"
    });
  }
}
