/**
 * Google Ads — real GAQL metrics (read-only) + OpenAI insights; mock fallback when unset or on error.
 * Config: `google-ads.yaml` in cwd or email-intake root, or env vars (see getGoogleAdsConfig).
 */

const fs = require("fs");
const path = require("path");

function parseSimpleYaml(str) {
  const o = {};
  for (const line of String(str).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf(":");
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let val = t.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    const hash = val.indexOf("#");
    if (hash !== -1) val = val.slice(0, hash).trim();
    o[key] = val;
  }
  return o;
}

function loadYamlConfig() {
  const candidates = [
    path.join(process.cwd(), "google-ads.yaml"),
    path.join(__dirname, "..", "..", "google-ads.yaml"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return parseSimpleYaml(fs.readFileSync(p, "utf8"));
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

function getGoogleAdsConfig() {
  const yaml = loadYamlConfig() || {};
  return {
    client_id:
      process.env.GOOGLE_ADS_CLIENT_ID ||
      process.env.GADS_CLIENT_ID ||
      yaml.client_id ||
      "",
    client_secret:
      process.env.GOOGLE_ADS_CLIENT_SECRET ||
      process.env.GADS_CLIENT_SECRET ||
      yaml.client_secret ||
      "",
    developer_token:
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
      process.env.GADS_DEVELOPER_TOKEN ||
      yaml.developer_token ||
      "",
    refresh_token:
      process.env.GOOGLE_ADS_REFRESH_TOKEN ||
      process.env.GADS_REFRESH_TOKEN ||
      yaml.refresh_token ||
      "",
    customer_id:
      process.env.GOOGLE_ADS_CUSTOMER_ID ||
      process.env.GADS_CUSTOMER_ID ||
      yaml.customer_id ||
      "",
  };
}

function normalizeCustomerId(raw) {
  return String(raw || "").replace(/[^0-9]/g, "");
}

function getAdsData() {
  return [
    {
      campaign: "Local T-Shirt Orders",
      clicks: 120,
      impressions: 5000,
      cost: 240,
      conversions: 6,
    },
    {
      campaign: "Custom Printing Greenville",
      clicks: 80,
      impressions: 3000,
      cost: 200,
      conversions: 2,
    },
  ];
}

const GAQL_LAST_30 = `
SELECT
  campaign.name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM campaign
WHERE segments.date DURING LAST_30_DAYS
`.trim();

/**
 * Fetch last-30-day campaign metrics from Google Ads API (read-only).
 * @returns {Promise<Array<{ campaign: string, impressions: number, clicks: number, cost: number, conversions: number }>>}
 */
async function getRealAdsData() {
  const cfg = getGoogleAdsConfig();
  const missing = [];
  if (!String(cfg.client_id).trim()) missing.push("client_id");
  if (!String(cfg.client_secret).trim()) missing.push("client_secret");
  if (!String(cfg.developer_token).trim()) missing.push("developer_token");
  if (!String(cfg.refresh_token).trim()) missing.push("refresh_token");
  const cid = normalizeCustomerId(cfg.customer_id);
  if (!cid) missing.push("customer_id");
  if (missing.length) {
    throw new Error(`Google Ads config incomplete (need ${missing.join(", ")})`);
  }

  const { GoogleAdsApi } = require("google-ads");
  const client = new GoogleAdsApi({
    client_id: String(cfg.client_id).trim(),
    client_secret: String(cfg.client_secret).trim(),
    developer_token: String(cfg.developer_token).trim(),
  });

  const customer = client.Customer({
    customer_id: cid,
    refresh_token: String(cfg.refresh_token).trim(),
  });

  const rows = await customer.query(GAQL_LAST_30);
  if (!Array.isArray(rows)) {
    throw new Error("Unexpected Google Ads response shape");
  }

  /** @type {Map<string, { campaign: string, impressions: number, clicks: number, costMicros: number, conversions: number }>} */
  const byKey = new Map();
  for (const row of rows) {
    const name =
      (row.campaign && row.campaign.name) || "Unknown campaign";
    const imp = Number((row.metrics && row.metrics.impressions) || 0);
    const clk = Number((row.metrics && row.metrics.clicks) || 0);
    const micros = Number((row.metrics && row.metrics.cost_micros) || 0);
    const conv = Number((row.metrics && row.metrics.conversions) || 0);

    const cur = byKey.get(name) || {
      campaign: name,
      impressions: 0,
      clicks: 0,
      costMicros: 0,
      conversions: 0,
    };
    cur.impressions += imp;
    cur.clicks += clk;
    cur.costMicros += micros;
    cur.conversions += conv;
    byKey.set(name, cur);
  }

  return Array.from(byKey.values()).map((r) => ({
    campaign: r.campaign,
    impressions: r.impressions,
    clicks: r.clicks,
    cost: r.costMicros / 1_000_000,
    conversions: r.conversions,
  }));
}

/**
 * @param {ReturnType<typeof getAdsData>} data
 * @returns {Promise<string>}
 */
async function analyzeAds(data) {
  const prompt = `You are a Google Ads expert.
Identify:
- wasted spend
- best campaigns
- optimization opportunities
- keyword strategy ideas

Campaign data (JSON):
${JSON.stringify(data, null, 2)}
`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return (
      "[Insights unavailable: OPENAI_API_KEY not set]\n\n" +
      "Heuristic preview from data:\n" +
      "- Compare cost per conversion: divide cost by conversions for each campaign.\n" +
      "- Review CTR (clicks/impressions) and pause or narrow low-intent terms.\n" +
      "- Test local intent keywords (e.g. city + service + rush) in separate ad groups."
    );
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a Google Ads expert for a local print shop. Be concise and actionable.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 900,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (body.error && body.error.message) ||
      `OpenAI request failed (${res.status})`;
    throw new Error(msg);
  }

  const text = body.choices && body.choices[0] && body.choices[0].message
    ? String(body.choices[0].message.content || "").trim()
    : "";
  if (!text) {
    throw new Error("Empty response from OpenAI");
  }
  return text;
}

module.exports = {
  getAdsData,
  getRealAdsData,
  analyzeAds,
  getGoogleAdsConfig,
};
