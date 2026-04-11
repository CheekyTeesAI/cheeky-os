"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharePointConfigError = void 0;
exports.assertSharePointEnvConfigured = assertSharePointEnvConfigured;
exports.getAccessToken = getAccessToken;
exports.getSiteId = getSiteId;
exports.getListId = getListId;
exports.findListItemByOrderId = findListItemByOrderId;
exports.createListItem = createListItem;
exports.updateListItem = updateListItem;
const logger_1 = require("../utils/logger");
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
class SharePointConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "SharePointConfigError";
    }
}
exports.SharePointConfigError = SharePointConfigError;
let tokenCache = null;
let siteIdCache = null;
let listIdCache = null;
function getEnvTrim(key) {
    return String(process.env[key] ?? "").trim();
}
function assertSharePointEnvConfigured() {
    const siteUrl = getEnvTrim("SHAREPOINT_SITE_URL");
    const listName = getEnvTrim("SHAREPOINT_LIST_NAME") || "Orders";
    const tenantId = getEnvTrim("SHAREPOINT_TENANT_ID");
    const clientId = getEnvTrim("SHAREPOINT_CLIENT_ID");
    const clientSecret = getEnvTrim("SHAREPOINT_CLIENT_SECRET");
    const missing = [];
    if (!siteUrl)
        missing.push("SHAREPOINT_SITE_URL");
    if (!tenantId)
        missing.push("SHAREPOINT_TENANT_ID");
    if (!clientId)
        missing.push("SHAREPOINT_CLIENT_ID");
    if (!clientSecret)
        missing.push("SHAREPOINT_CLIENT_SECRET");
    if (missing.length > 0) {
        throw new SharePointConfigError(`SharePoint is not configured. Set: ${missing.join(", ")}`);
    }
    return { siteUrl, listName, tenantId, clientId, clientSecret };
}
function parseSitePath(siteUrl) {
    let u;
    try {
        u = new URL(siteUrl);
    }
    catch {
        throw new SharePointConfigError("SHAREPOINT_SITE_URL must be a valid URL (e.g. https://tenant.sharepoint.com/sites/YourSite)");
    }
    const hostname = u.hostname;
    let serverRelativePath = u.pathname.replace(/\/$/, "") || "/";
    if (serverRelativePath === "")
        serverRelativePath = "/";
    return { hostname, serverRelativePath };
}
async function graphJson(path, token, init) {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${GRAPH_BASE}${path}`, { ...init, headers });
    const text = await res.text();
    if (!res.ok) {
        logger_1.logger.warn(`SharePoint Graph error ${res.status}: ${text.slice(0, 500)}`);
        throw new Error(`Microsoft Graph request failed (${res.status}): ${text}`);
    }
    return text.length ? JSON.parse(text) : {};
}
async function getAccessToken() {
    const cfg = assertSharePointEnvConfigured();
    const now = Date.now();
    if (tokenCache && tokenCache.expiresAtMs > now + 60000) {
        return tokenCache.token;
    }
    const body = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
    });
    const tokenUrl = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
    const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });
    const raw = await res.text();
    if (!res.ok) {
        logger_1.logger.warn(`SharePoint token error ${res.status}: ${raw.slice(0, 300)}`);
        throw new Error(`Failed to obtain Microsoft Graph token (${res.status})`);
    }
    const json = JSON.parse(raw);
    if (!json.access_token) {
        throw new Error("Token response missing access_token");
    }
    const ttlSec = json.expires_in ?? 3600;
    tokenCache = {
        token: json.access_token,
        expiresAtMs: now + ttlSec * 1000,
    };
    return json.access_token;
}
async function getSiteId() {
    if (siteIdCache)
        return siteIdCache;
    const cfg = assertSharePointEnvConfigured();
    const token = await getAccessToken();
    const { hostname, serverRelativePath } = parseSitePath(cfg.siteUrl);
    const pathSeg = serverRelativePath === "/"
        ? `sites/${hostname}:/`
        : `sites/${hostname}:${encodeURIComponent(serverRelativePath)}`;
    const data = (await graphJson(`/${pathSeg}`, token));
    if (!data.id) {
        throw new Error("Could not resolve SharePoint site id from Graph");
    }
    siteIdCache = data.id;
    logger_1.logger.info(`SharePoint site id resolved (cached): ${siteIdCache}`);
    return siteIdCache;
}
async function getListId() {
    if (listIdCache)
        return listIdCache;
    const cfg = assertSharePointEnvConfigured();
    const token = await getAccessToken();
    const siteId = await getSiteId();
    const filter = `displayName eq '${cfg.listName.replace(/'/g, "''")}'`;
    const data = (await graphJson(`/sites/${siteId}/lists?$filter=${encodeURIComponent(filter)}`, token));
    const first = data.value?.[0];
    if (!first?.id) {
        throw new Error(`SharePoint list not found: "${cfg.listName}". Check SHAREPOINT_LIST_NAME.`);
    }
    listIdCache = first.id;
    logger_1.logger.info(`SharePoint list id resolved (cached): ${listIdCache}`);
    return listIdCache;
}
function escapeODataString(value) {
    return value.replace(/'/g, "''");
}
async function findListItemByOrderId(orderId) {
    const token = await getAccessToken();
    const siteId = await getSiteId();
    const listId = await getListId();
    const safeId = escapeODataString(orderId);
    const filter = `fields/ExternalOrderId eq '${safeId}'`;
    const path = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$filter=${encodeURIComponent(filter)}&$top=5`;
    const data = (await graphJson(path, token, {
        headers: {
            Prefer: "HonorNonIndexedQueriesWarning",
            ConsistencyLevel: "eventual",
        },
    }));
    const rows = data.value ?? [];
    if (rows.length > 1) {
        logger_1.logger.warn(`SharePoint: multiple items matched ExternalOrderId=${orderId}; using first`);
    }
    const first = rows[0];
    return first?.id ? { id: first.id } : null;
}
async function createListItem(payload) {
    const token = await getAccessToken();
    const siteId = await getSiteId();
    const listId = await getListId();
    const data = (await graphJson(`/sites/${siteId}/lists/${listId}/items`, token, {
        method: "POST",
        body: JSON.stringify({ fields: payload }),
    }));
    if (!data.id) {
        throw new Error("Graph create list item returned no id");
    }
    return { id: data.id };
}
async function updateListItem(itemId, payload) {
    const token = await getAccessToken();
    const siteId = await getSiteId();
    const listId = await getListId();
    await graphJson(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
    });
}
