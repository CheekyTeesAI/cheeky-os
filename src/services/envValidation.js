"use strict";

const PLACEHOLDER_SECRETS = new Set([
  "",
  "replace_me",
  "placeholder",
  "placeholder_replace_me",
  "changeme",
  "test",
  "test_key",
  "api_key",
  "your_api_key",
  "your-api-key",
  "secret",
  "xxx",
]);

function isPlaceholderSecret(value) {
  const s = String(value == null ? "" : value).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (PLACEHOLDER_SECRETS.has(lower)) return true;
  if (/^replace[_-]?me$/i.test(s)) return true;
  if (/^placeholder/i.test(lower)) return true;
  if (/^your[-_]?api/i.test(lower)) return true;
  if (/^sk-or-replace/i.test(lower)) return true;
  return false;
}

const PLACEHOLDER_URL_SNIPPETS = [
  "your-production-domain",
  "your-live-domain",
  "example.com",
  "example.org",
  "localhost-placeholder",
  "app.example.com",
];

function isPlaceholderUrl(value) {
  const s = String(value == null ? "" : value).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  for (const snip of PLACEHOLDER_URL_SNIPPETS) {
    if (lower.includes(snip)) return true;
  }
  if (lower === "http://localhost" || lower === "https://localhost") return false;
  return false;
}

/**
 * Live GPT Actions "READY" requires non-placeholder API key and HTTPS public URL.
 */
function getEnvReadiness() {
  const key = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
  const url = String(process.env.PUBLIC_BASE_URL || "").trim();
  const blockedReasons = [];

  const keyOk = Boolean(key) && !isPlaceholderSecret(key);
  if (!keyOk) {
    blockedReasons.push("CHATGPT_ACTION_API_KEY is empty or placeholder; set a strong secret in deployment env (not in git).");
  }

  const urlNonPlaceholder = Boolean(url) && !isPlaceholderUrl(url);
  const urlHttps = /^https:\/\//i.test(url);
  const publicBaseUrlReady = urlNonPlaceholder && urlHttps;
  if (!url) {
    blockedReasons.push("PUBLIC_BASE_URL is unset; set the live public HTTPS base URL in deployment env.");
  } else if (isPlaceholderUrl(url)) {
    blockedReasons.push("PUBLIC_BASE_URL is still a placeholder; replace with the real public HTTPS origin.");
  } else if (!urlHttps) {
    blockedReasons.push("PUBLIC_BASE_URL must be https:// for production GPT Actions (local http may be used for dev smoke tests with PARTIAL).");
  }

  return {
    chatgptActionApiKeyReady: keyOk,
    publicBaseUrlReady,
    publicBaseUrlHttps: urlHttps,
    publicBaseUrlNonPlaceholder: urlNonPlaceholder,
    blockedReasons,
  };
}

/**
 * For local/CI smoke tests only: true if the server is allowed to accept API key auth (non-placeholder key configured).
 */
function isServerChatgptApiKeyConfigValid() {
  const key = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
  return Boolean(key) && !isPlaceholderSecret(key);
}

module.exports = {
  isPlaceholderSecret,
  isPlaceholderUrl,
  getEnvReadiness,
  isServerChatgptApiKeyConfigValid,
  PLACEHOLDER_SECRETS,
};
