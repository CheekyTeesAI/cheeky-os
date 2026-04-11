import path from "path";
import dotenv from "dotenv";

// Load package-root .env regardless of process.cwd() (fixes missing API_KEY under tsx/IDE)
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const useMock = process.env.USE_MOCK === "true";
const openAiApiKey = (process.env.OPENAI_API_KEY || "").trim();

if (!useMock && !openAiApiKey) {
  throw new Error(
    "OPENAI_API_KEY is required when USE_MOCK is not true. Set USE_MOCK=true for local mock parsing."
  );
}

export const config = {
  port: Number(process.env.PORT || 3000),
  openAiApiKey,
  openAiBaseUrl: "https://api.openai.com/v1/responses",
  useMock
};
