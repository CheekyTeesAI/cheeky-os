import { ConfidentialClientApplication } from "@azure/msal-node";
import { logger } from "../utils/logger";

let cached: { token: string; expiresOn: Date } | null = null;

function requireEnv(name: string): string {
  const v = String(process.env[name] || "").trim();
  if (!v) {
    throw new Error(`graphAuthService: missing required env ${name}`);
  }
  return v;
}

/**
 * Client credentials token for Microsoft Graph (cached until shortly before expiry).
 */
export async function getGraphToken(): Promise<string> {
  const tenantId = requireEnv("MS_TENANT_ID");
  const clientId = requireEnv("MS_CLIENT_ID");
  const clientSecret = requireEnv("MS_CLIENT_SECRET");

  const now = Date.now();
  if (cached && cached.expiresOn.getTime() - now > 60_000) {
    return cached.token;
  }

  const authority = `https://login.microsoftonline.com/${tenantId}`;
  const app = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority,
      clientSecret,
    },
  });

  const result = await app.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result || !result.accessToken) {
    throw new Error("graphAuthService: acquireTokenByClientCredential returned no accessToken");
  }

  const expiresOn = result.expiresOn || new Date(now + 3600_000);
  cached = { token: result.accessToken, expiresOn };
  logger.info("[graphAuthService] acquired Graph token");
  return result.accessToken;
}
