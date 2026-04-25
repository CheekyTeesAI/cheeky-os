"use strict";

const { isServerChatgptApiKeyConfigValid: isServerKeyOk } = require("./envValidation");

function getExpectedChatGPTApiKey() {
  return String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
}

function readProvidedKey(req) {
  const authHeader = String((req && req.headers && req.headers.authorization) || "").trim();
  const xApiKey = String((req && req.headers && req.headers["x-api-key"]) || "").trim();
  if (xApiKey) return xApiKey;
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return authHeader;
}

function isValidChatGPTActionKey(req) {
  if (!isServerKeyOk()) return false;
  const expected = getExpectedChatGPTApiKey();
  const provided = readProvidedKey(req);
  if (!expected) return false;
  if (!provided) return false;
  return provided === expected;
}

function requireChatGPTActionAuth(req, res, next) {
  const route = req && req.path ? req.path : "unknown";
  if (!isServerKeyOk()) {
    console.log(`[CHATGPT AUTH] BLOCKED | ${route} | CHATGPT_ACTION_API_KEY missing_or_placeholder`);
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      reason: "CHATGPT_ACTION_API_KEY is missing or placeholder; set a strong secret in environment (not in source control).",
      route,
      timestamp: new Date().toISOString(),
    });
  }
  const expected = getExpectedChatGPTApiKey();
  if (!isValidChatGPTActionKey(req)) {
    console.log(`[CHATGPT AUTH] BLOCKED | ${route} | invalid_or_missing_api_key`);
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      route,
      timestamp: new Date().toISOString(),
    });
  }
  console.log(`[CHATGPT AUTH] OK | ${route}`);
  return next();
}

module.exports = {
  getExpectedChatGPTApiKey,
  isValidChatGPTActionKey,
  requireChatGPTActionAuth,
  isServerChatgptApiKeyConfigValid: isServerKeyOk,
};
