import { logger } from "../utils/logger";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class SharePointConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharePointConfigError";
  }
}

interface SharePointEnv {
  siteUrl: string;
  listName: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

let tokenCache: { token: string; expiresAtMs: number } | null = null;
let siteIdCache: string | null = null;
let listIdCache: string | null = null;

function getEnvTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

export function assertSharePointEnvConfigured(): SharePointEnv {
  const siteUrl = getEnvTrim("SHAREPOINT_SITE_URL");
  const listName = getEnvTrim("SHAREPOINT_LIST_NAME") || "Orders";
  const tenantId = getEnvTrim("SHAREPOINT_TENANT_ID");
  const clientId = getEnvTrim("SHAREPOINT_CLIENT_ID");
  const clientSecret = getEnvTrim("SHAREPOINT_CLIENT_SECRET");

  const missing: string[] = [];
  if (!siteUrl) missing.push("SHAREPOINT_SITE_URL");
  if (!tenantId) missing.push("SHAREPOINT_TENANT_ID");
  if (!clientId) missing.push("SHAREPOINT_CLIENT_ID");
  if (!clientSecret) missing.push("SHAREPOINT_CLIENT_SECRET");

  if (missing.length > 0) {
    throw new SharePointConfigError(
      `SharePoint is not configured. Set: ${missing.join(", ")}`
    );
  }

  return { siteUrl, listName, tenantId, clientId, clientSecret };
}

function parseSitePath(siteUrl: string): { hostname: string; serverRelativePath: string } {
  let u: URL;
  try {
    u = new URL(siteUrl);
  } catch {
    throw new SharePointConfigError(
      "SHAREPOINT_SITE_URL must be a valid URL (e.g. https://tenant.sharepoint.com/sites/YourSite)"
    );
  }
  const hostname = u.hostname;
  let serverRelativePath = u.pathname.replace(/\/$/, "") || "/";
  if (serverRelativePath === "") serverRelativePath = "/";
  return { hostname, serverRelativePath };
}

async function graphJson(
  path: string,
  token: string,
  init?: RequestInit
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${GRAPH_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    logger.warn(`SharePoint Graph error ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`Microsoft Graph request failed (${res.status}): ${text}`);
  }
  return text.length ? JSON.parse(text) : {};
}

export async function getAccessToken(): Promise<string> {
  const cfg = assertSharePointEnvConfigured();
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
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
    logger.warn(`SharePoint token error ${res.status}: ${raw.slice(0, 300)}`);
    throw new Error(`Failed to obtain Microsoft Graph token (${res.status})`);
  }
  const json = JSON.parse(raw) as {
    access_token: string;
    expires_in?: number;
  };
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

export async function getSiteId(): Promise<string> {
  if (siteIdCache) return siteIdCache;
  const cfg = assertSharePointEnvConfigured();
  const token = await getAccessToken();
  const { hostname, serverRelativePath } = parseSitePath(cfg.siteUrl);
  const pathSeg =
    serverRelativePath === "/"
      ? `sites/${hostname}:/`
      : `sites/${hostname}:${encodeURIComponent(serverRelativePath)}`;
  const data = (await graphJson(`/${pathSeg}`, token)) as { id?: string };
  if (!data.id) {
    throw new Error("Could not resolve SharePoint site id from Graph");
  }
  siteIdCache = data.id;
  logger.info(`SharePoint site id resolved (cached): ${siteIdCache}`);
  return siteIdCache;
}

export async function getListId(): Promise<string> {
  if (listIdCache) return listIdCache;
  const cfg = assertSharePointEnvConfigured();
  const token = await getAccessToken();
  const siteId = await getSiteId();
  const filter = `displayName eq '${cfg.listName.replace(/'/g, "''")}'`;
  const data = (await graphJson(
    `/sites/${siteId}/lists?$filter=${encodeURIComponent(filter)}`,
    token
  )) as { value?: Array<{ id?: string }> };
  const first = data.value?.[0];
  if (!first?.id) {
    throw new Error(
      `SharePoint list not found: "${cfg.listName}". Check SHAREPOINT_LIST_NAME.`
    );
  }
  listIdCache = first.id;
  logger.info(`SharePoint list id resolved (cached): ${listIdCache}`);
  return listIdCache;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function findListItemByOrderId(
  orderId: string
): Promise<{ id: string } | null> {
  const token = await getAccessToken();
  const siteId = await getSiteId();
  const listId = await getListId();
  const safeId = escapeODataString(orderId);
  const filter = `fields/ExternalOrderId eq '${safeId}'`;
  const path =
    `/sites/${siteId}/lists/${listId}/items?$expand=fields&$filter=${encodeURIComponent(
      filter
    )}&$top=5`;
  const data = (await graphJson(path, token, {
    headers: {
      Prefer: "HonorNonIndexedQueriesWarning",
      ConsistencyLevel: "eventual",
    },
  })) as { value?: Array<{ id?: string }> };
  const rows = data.value ?? [];
  if (rows.length > 1) {
    logger.warn(
      `SharePoint: multiple items matched ExternalOrderId=${orderId}; using first`
    );
  }
  const first = rows[0];
  return first?.id ? { id: first.id } : null;
}

export async function createListItem(
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  const token = await getAccessToken();
  const siteId = await getSiteId();
  const listId = await getListId();
  const data = (await graphJson(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ fields: payload }),
    }
  )) as { id?: string };
  if (!data.id) {
    throw new Error("Graph create list item returned no id");
  }
  return { id: data.id };
}

export async function updateListItem(
  itemId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const token = await getAccessToken();
  const siteId = await getSiteId();
  const listId = await getListId();
  await graphJson(
    `/sites/${siteId}/lists/${listId}/items/${itemId}/fields`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}
