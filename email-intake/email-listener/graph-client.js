// PHASE 1 — EMAIL AUTO-INTAKE: Microsoft Graph API client
/**
 * Provides authenticated access to Microsoft Graph API for reading
 * Outlook mail. Uses @azure/identity for client-credentials auth
 * and native fetch for HTTP calls (no SDK wrapper needed for mail).
 *
 * Requires env vars: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
 * OUTLOOK_USER_EMAIL
 *
 * @module email-listener/graph-client
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { ClientSecretCredential } = require("@azure/identity");

/** Graph API base URL */
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** The mailbox to poll — set in .env */
const USER_EMAIL = process.env.OUTLOOK_USER_EMAIL || "";

/**
 * Build an Azure AD credential using client-secret flow.
 * Validates that all required env vars are present before constructing.
 * @returns {ClientSecretCredential} Credential instance for token acquisition.
 * @throws {Error} If any required env var is missing.
 */
function buildCredential() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  const missing = [];
  if (!tenantId) missing.push("AZURE_TENANT_ID");
  if (!clientId) missing.push("AZURE_CLIENT_ID");
  if (!clientSecret) missing.push("AZURE_CLIENT_SECRET");
  if (!USER_EMAIL) missing.push("OUTLOOK_USER_EMAIL");

  if (missing.length > 0) {
    throw new Error(
      `Graph API config incomplete. Missing: ${missing.join(", ")}. ` +
      `Set these in your .env file.`
    );
  }

  return new ClientSecretCredential(tenantId, clientId, clientSecret);
}

/**
 * Get a valid access token for Microsoft Graph API.
 * Scoped to https://graph.microsoft.com/.default (app-level permissions).
 * @returns {Promise<string>} Bearer access token.
 */
async function getGraphToken() {
  const credential = buildCredential();
  const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
  return tokenResponse.token;
}

/**
 * Fetch unread emails from the user's Outlook inbox.
 * Returns up to 10 unread messages, newest first.
 * @returns {Promise<Array>} Array of Graph mail message objects.
 */
async function getUnreadEmails() {
  const token = await getGraphToken();
  const url =
    `${GRAPH_BASE}/users/customer.service@cheekyteesllc.com/messages` +
    `?$filter=isRead eq false` +
    `&$orderby=receivedDateTime desc` +
    `&$top=10` +
    `&$select=id,subject,from,body,receivedDateTime`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.value || [];
}

/**
 * Mark a specific email as read in the user's mailbox.
 * Prevents the same email from being processed again on next poll.
 * @param {string} messageId - The Graph message ID to mark as read.
 * @returns {Promise<void>}
 */
async function markAsRead(messageId) {
  const token = await getGraphToken();
  const url = `${GRAPH_BASE}/users/customer.service@cheekyteesllc.com/messages/${messageId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isRead: true }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to mark message ${messageId} as read (${res.status}): ${errText}`);
  }
}

module.exports = { getUnreadEmails, markAsRead, getGraphToken, buildCredential, GRAPH_BASE, USER_EMAIL };
