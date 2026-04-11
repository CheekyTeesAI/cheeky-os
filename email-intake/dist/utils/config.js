"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load package-root .env regardless of process.cwd() (fixes missing API_KEY under tsx/IDE)
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "..", "..", ".env") });
const useMock = process.env.USE_MOCK === "true";
const openAiApiKey = (process.env.OPENAI_API_KEY || "").trim();
if (!useMock && !openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required when USE_MOCK is not true. Set USE_MOCK=true for local mock parsing.");
}
exports.config = {
    port: Number(process.env.PORT || 3000),
    openAiApiKey,
    openAiBaseUrl: "https://api.openai.com/v1/responses",
    useMock
};
