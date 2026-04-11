import axios from "axios";
import { z } from "zod";
import { BrainOutput } from "../types";
import { config } from "../utils/config";
import { SAFETY } from "../utils/safety";

const SYSTEM_PROMPT = `You extract structured invoice data from text.
Return ONLY valid JSON with exactly these keys:
intent, customerName, quantity, unitPrice, confidence.

intent: "CREATE_INVOICE" only when the text clearly specifies a billable order (who is buying, how many units, price per unit). Otherwise "UNKNOWN".

customerName: company or person name for CREATE_INVOICE; use "" for UNKNOWN.

quantity: positive integer count of items for CREATE_INVOICE; use 0 for UNKNOWN.

unitPrice: positive number (currency per item) for CREATE_INVOICE; use 0 for UNKNOWN.

confidence: number from 0 to 1 for how certain you are overall.

NO extra keys. NO markdown. NO explanations outside the JSON object.`;

const rawResponseSchema = z.object({
  intent: z.enum(["CREATE_INVOICE", "UNKNOWN"]),
  customerName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  confidence: z.number().min(0).max(1)
});

function finalizeBrainOutput(
  parsed: z.infer<typeof rawResponseSchema>,
  source: BrainOutput["source"]
): BrainOutput {
  let { intent, customerName, quantity, unitPrice, confidence } = parsed;
  const name = (customerName || "").trim();

  if (intent === "UNKNOWN") {
    return {
      intent: "UNKNOWN",
      customerName: name,
      quantity: 0,
      unitPrice: 0,
      confidence: Math.min(confidence, 0.79),
      source
    };
  }

  if (!name || quantity <= 0 || unitPrice <= 0) {
    return {
      intent: "UNKNOWN",
      customerName: name,
      quantity: 0,
      unitPrice: 0,
      confidence: Math.min(confidence, 0.79),
      source
    };
  }

  confidence = Math.min(Math.max(confidence, 0), 1);
  return {
    intent: "CREATE_INVOICE",
    customerName: name,
    quantity: Math.round(quantity),
    unitPrice,
    confidence,
    source
  };
}

function unknownFallback(source: BrainOutput["source"]): BrainOutput {
  return {
    intent: "UNKNOWN",
    customerName: "",
    quantity: 0,
    unitPrice: 0,
    confidence: 0,
    source
  };
}

function parseMock(text: string): BrainOutput {
  const t = text.trim();
  let m = t.match(/(\d+).*?at\s+\$?(\d+).*?for\s+(.+)$/i);
  if (!m) {
    m = t.match(
      /(?:create\s+invoice\s+)?for\s+(\d+)\s+[^.]*?at\s+\$?(\d+)\s+each\s+for\s+(.+)$/i
    );
  }
  if (!m) {
    return { ...unknownFallback("mock"), confidence: 0 };
  }
  const quantity = Number(m[1]);
  const unitPrice = Number(m[2]);
  const customer = m[3].trim();
  if (!quantity || !unitPrice || !customer) {
    return { ...unknownFallback("mock"), confidence: 0 };
  }
  return finalizeBrainOutput(
    {
      intent: "CREATE_INVOICE",
      customerName: customer,
      quantity,
      unitPrice,
      confidence: 0.99
    },
    "mock"
  );
}

async function callOpenAi(text: string): Promise<BrainOutput> {
  const payload = {
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "brain_invoice_extract",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: {
              type: "string",
              enum: ["CREATE_INVOICE", "UNKNOWN"]
            },
            customerName: { type: "string" },
            quantity: { type: "number" },
            unitPrice: { type: "number" },
            confidence: { type: "number" }
          },
          required: [
            "intent",
            "customerName",
            "quantity",
            "unitPrice",
            "confidence"
          ]
        }
      }
    }
  };

  const res = await axios.post(config.openAiBaseUrl, payload, {
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });

  const outputText = String(
    res.data?.output?.[0]?.content?.[0]?.text ?? res.data?.output_text ?? ""
  );
  let json: unknown;
  try {
    json = JSON.parse(outputText);
  } catch {
    return unknownFallback("fallback");
  }
  const safe = rawResponseSchema.safeParse(json);
  if (!safe.success) {
    return unknownFallback("fallback");
  }
  return finalizeBrainOutput(safe.data, "openai");
}

export async function brain(text: string): Promise<BrainOutput> {
  if (SAFETY.USE_MOCK) {
    return parseMock(text);
  }

  try {
    return await callOpenAi(text);
  } catch {
    try {
      return await callOpenAi(text);
    } catch {
      return unknownFallback("fallback");
    }
  }
}
