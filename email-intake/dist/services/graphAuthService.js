"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGraphToken = getGraphToken;
const msal_node_1 = require("@azure/msal-node");
const logger_1 = require("../utils/logger");
let cached = null;
function requireEnv(name) {
    const v = String(process.env[name] || "").trim();
    if (!v) {
        throw new Error(`graphAuthService: missing required env ${name}`);
    }
    return v;
}
/**
 * Client credentials token for Microsoft Graph (cached until shortly before expiry).
 */
async function getGraphToken() {
    const tenantId = requireEnv("MS_TENANT_ID");
    const clientId = requireEnv("MS_CLIENT_ID");
    const clientSecret = requireEnv("MS_CLIENT_SECRET");
    const now = Date.now();
    if (cached && cached.expiresOn.getTime() - now > 60000) {
        return cached.token;
    }
    const authority = `https://login.microsoftonline.com/${tenantId}`;
    const app = new msal_node_1.ConfidentialClientApplication({
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
    const expiresOn = result.expiresOn || new Date(now + 3600000);
    cached = { token: result.accessToken, expiresOn };
    logger_1.logger.info("[graphAuthService] acquired Graph token");
    return result.accessToken;
}
