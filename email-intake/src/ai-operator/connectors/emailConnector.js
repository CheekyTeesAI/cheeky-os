"use strict";

function trimEnv(name) {
  return String(process.env[name] || "").trim();
}

function graphKeys() {
  return ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "MS_GRAPH_MAILBOX_USER"];
}

function gmailKeys() {
  return ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
}

function graphEnvSnapshot() {
  const keys = graphKeys();
  const missing = keys.filter((k) => !trimEnv(k));
  return {
    provider: "microsoft_graph",
    complete: missing.length === 0,
    missingKeys: missing,
  };
}

function gmailEnvSnapshot() {
  const keys = gmailKeys();
  const missing = keys.filter((k) => !trimEnv(k));
  return {
    provider: "gmail_api",
    complete: missing.length === 0,
    missingKeys: missing,
  };
}

function unionMissingVars() {
  const g = graphEnvSnapshot();
  const gm = gmailEnvSnapshot();
  return Array.from(new Set([].concat(g.missingKeys || [], gm.missingKeys || [])));
}

function isConfigured() {
  const graph = graphEnvSnapshot();
  const gmail = gmailEnvSnapshot();

  if (graph.complete) {
    return {
      configured: true,
      activeProvider: graph.provider,
      microsoftGraph: graph,
      gmail,
    };
  }
  if (gmail.complete) {
    return {
      configured: true,
      activeProvider: gmail.provider,
      microsoftGraph: graph,
      gmail,
    };
  }

  return {
    configured: false,
    activeProvider: null,
    microsoftGraph: graph,
    gmail,
  };
}

async function searchEmails(/* query */ _query, /* options */ _options = {}) {
  const cfg = isConfigured();
  if (!cfg.configured) {
    return {
      status: "NOT_CONFIGURED",
      missingEnvVars: unionMissingVars(),
      emails: [],
    };
  }

  return {
    status: "NOT_IMPLEMENTED",
    emails: [],
    activeProvider: cfg.activeProvider,
    message:
      "searchEmails Phase 1: mailbox credentials detected; Microsoft Graph / Gmail search implementation pending.",
  };
}

async function getLastEmailFromContact(contactNameOrEmail) {
  const contact = String(contactNameOrEmail || "").trim();
  const base = {
    status: "INVALID_INPUT",
    contact: contact || null,
    subject: null,
    from: null,
    receivedAt: null,
    snippet: null,
    summary: null,
    missingEnvVars: null,
  };

  if (!contact) {
    return Object.assign({}, base, {
      summary: "contact (or contactNameOrEmail) is required.",
    });
  }

  const cfg = isConfigured();
  if (!cfg.configured) {
    return Object.assign({}, base, {
      status: "NOT_CONFIGURED",
      summary:
        "Mailbox read is not configured. Set either a full Microsoft Graph (M365) or full Gmail OAuth variable set.",
      missingEnvVars: unionMissingVars(),
    });
  }

  return Object.assign({}, base, {
    status: "NOT_IMPLEMENTED",
    summary:
      "Mailbox API variables are present, but fetching the latest message via Graph/Gmail is not implemented in Phase 1. No message was read.",
    missingEnvVars: null,
    activeProvider: cfg.activeProvider,
  });
}

module.exports = {
  isConfigured,
  searchEmails,
  getLastEmailFromContact,
};
