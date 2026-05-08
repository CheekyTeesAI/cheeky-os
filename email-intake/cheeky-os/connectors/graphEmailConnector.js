"use strict";

/**
 * Microsoft Graph read-only mailbox access (Mail.Read application permission).
 * Client credentials flow. Never logs tokens or secrets.
 */

const fs = require("fs");
const path = require("path");

const { fetchSafeTransientRetry } = require("../services/cheekyOsHttpRetry.service");
const taskQueue = require("../agent/taskQueue");

/** @type {{ token: string, expMs: number } | null} */
let _tok = null;

function graphTimeoutMs() {
  try {
    const n = Number(process.env.CHEEKY_GRAPH_HTTP_TIMEOUT_MS || 35000);
    return Number.isFinite(n) && n >= 3000 ? Math.min(n, 120000) : 35000;
  } catch (_e) {
    return 35000;
  }
}

function auditGraph(operation, meta) {
  try {
    taskQueue.ensureDirAndFiles();
    const p = path.join(taskQueue.DATA_DIR, "graph-read-audit.jsonl");
    const row = Object.assign({}, meta || {}, {
      operation: String(operation || "graph_read"),
      at: new Date().toISOString(),
      readOnly: true,
    });
    fs.appendFileSync(p, `${JSON.stringify(row)}\n`, "utf8");
  } catch (_e) {}
}

function invalidateCachedToken() {
  try {
    _tok = null;
  } catch (_e) {
    _tok = null;
  }
}

function isConfigured() {
  try {
    const t = String(process.env.MS_GRAPH_TENANT_ID || "").trim();
    const c = String(process.env.MS_GRAPH_CLIENT_ID || "").trim();
    const s = String(process.env.MS_GRAPH_CLIENT_SECRET || "").trim();
    const m = String(process.env.MS_GRAPH_MAILBOX_USER || "").trim();
    return !!(t && c && s && m);
  } catch (_e) {
    return false;
  }
}

function mailboxUser() {
  try {
    return String(process.env.MS_GRAPH_MAILBOX_USER || "").trim();
  } catch (_e) {
    return "";
  }
}

async function getAccessToken() {
  try {
    if (!isConfigured()) {
      return {
        ok: false,
        error: "graph_not_configured",
        configured: false,
      };
    }
    const now = Date.now();
    if (_tok && _tok.token && _tok.expMs > now + 30_000) {
      return { ok: true, accessToken: _tok.token, configured: true, cached: true };
    }

    const tenant = String(process.env.MS_GRAPH_TENANT_ID || "").trim();
    const clientId = String(process.env.MS_GRAPH_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.MS_GRAPH_CLIENT_SECRET || "").trim();

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j || !j.access_token) {
      return {
        ok: false,
        error: j && j.error_description ? String(j.error_description).slice(0, 240) : "token_request_failed",
        configured: true,
      };
    }

    const expMs = Date.now() + Math.max(60, Number(j.expires_in) || 3600) * 1000 - 120_000;
    _tok = { token: String(j.access_token), expMs };
    return { ok: true, accessToken: _tok.token, configured: true, cached: false };
  } catch (e) {
    return { ok: false, error: e.message || String(e), configured: isConfigured() };
  }
}

/**
 * Low-level GET against Graph beta/v1 — read only.
 *
 * @param {string} pathAndQuery begins with /
 */
async function graphGet(pathAndQuery, extraHeaders) {
  const t0 = Date.now();
  try {
    const tryOnce = async () => {
      const gt = await getAccessToken();
      if (!gt.ok || !gt.accessToken) {
        return {
          ok: false,
          status: null,
          data: null,
          error: gt.error || "no_token",
        };
      }
      const url = pathAndQuery.startsWith("http")
        ? pathAndQuery
        : `https://graph.microsoft.com/v1.0${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;
      const headers = Object.assign(
        {
          Authorization: `Bearer ${gt.accessToken}`,
          Accept: "application/json",
        },
        extraHeaders || {}
      );
      const r = await fetchSafeTransientRetry(
        url,
        { method: "GET", headers, timeoutMs: graphTimeoutMs() },
        { label: "graph:read" }
      );
      if (!r.ok) {
        return {
          ok: false,
          status: null,
          data: r.data || null,
          error: r.error || "graph_fetch_failed",
        };
      }
      const data = r.data;
      const statusGuess = 200;
      return { ok: true, status: statusGuess, data, error: null };
    };

    let out = await tryOnce();
    try {
      if (!out.ok && /HTTP\s+401\b/i.test(String(out.error || ""))) {
        invalidateCachedToken();
        out = await tryOnce();
      }
      const de = out.data && out.data.error;
      if (
        !out.ok &&
        de &&
        String(de.code || "") === "InvalidAuthenticationToken"
      ) {
        invalidateCachedToken();
        out = await tryOnce();
      }
    } catch (_r401) {}

    try {
      const mc = require("../diagnostics/metricsCollector");
      mc.noteConnectorLatency("graph", Date.now() - t0, !!out.ok);
    } catch (_mc) {}

    if (out.ok) {
      auditGraph("graphGet", {
        pathSample: String(pathAndQuery || "").slice(0, 120),
        durationMs: Date.now() - t0,
      });
    }
    const httpStatus =
      out.ok === true
        ? out.status != null
          ? out.status
          : 200
        : (() => {
            const m = String(out.error || "").match(/HTTP\s+(\d{3})\b/);
            return m ? Number(m[1]) : null;
          })();
    return Object.assign({}, out, { httpStatus });
  } catch (e) {
    try {
      const mc = require("../diagnostics/metricsCollector");
      mc.noteConnectorLatency("graph", Date.now() - t0, false);
    } catch (_mc2) {}
    return { ok: false, status: null, data: null, error: e.message || String(e), httpStatus: null };
  }
}

/**
 *
 * @param {string} query
 * @param {{ limit?: number }=} options
 */
async function searchEmails(query, options) {
  try {
    const mb = mailboxUser();
    if (!query || !String(query).trim()) {
      return { ok: false, error: "empty_query", messages: [] };
    }
    const lim = Math.min(50, Math.max(1, Number((options && options.limit) || 20)));
    const q = encodeURIComponent(String(query).trim());
    /** $search requires ConsistencyLevel eventual on some endpoints */
    const path = `/users/${encodeURIComponent(mb)}/messages?$top=${lim}&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments&$search="${q}"`;
    const r = await graphGet(path, { ConsistencyLevel: "eventual" });
    if (!r.ok) {
      /** Fallback — recent inbox + filter client-side */
      const fb = await getRecentInbox(Math.max(lim * 3, 30));
      if (!fb.ok) return { ok: false, error: r.error || "search_failed", messages: [], fallbackAttempted: true };
      const needle = String(query).toLowerCase();
      const filt = (fb.messages || []).filter((m) => {
        try {
          const sub = String(m.subject || "").toLowerCase();
          const prv = String(m.bodyPreview || "").toLowerCase();
          return sub.includes(needle) || prv.includes(needle);
        } catch (_e2) {
          return false;
        }
      });
      return { ok: true, messages: filt.slice(0, lim), mode: "client_filter_fallback" };
    }
    const list = r.data && r.data.value ? r.data.value : [];
    return { ok: true, messages: Array.isArray(list) ? list : [], mode: "graph_search" };
  } catch (e) {
    return { ok: false, error: e.message || String(e), messages: [] };
  }
}

/**
 * @param {string} limit
 */
async function getRecentInbox(limit) {
  try {
    const mb = mailboxUser();
    if (!mb) return { ok: false, error: "missing_mailbox", messages: [] };
    const lim = Math.min(100, Math.max(1, Number(limit) || 15));
    const path = `/users/${encodeURIComponent(
      mb
    )}/mailFolders/Inbox/messages?$top=${lim}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead,conversationId`;
    const r = await graphGet(path, {});
    if (!r.ok) return { ok: false, error: r.error || "inbox_failed", messages: [], status: r.status };
    const list = r.data && r.data.value ? r.data.value : [];
    return { ok: true, messages: Array.isArray(list) ? list : [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e), messages: [] };
  }
}

/**
 * Match display name OR email substring (case-insensitive).

 * @param {string} contact
 */
async function getLastEmailFromContact(contact) {
  try {
    const term = String(contact || "").trim();
    if (!term) return { ok: false, error: "empty_contact", email: null };
    const needle = term.toLowerCase();
    const recent = await getRecentInbox(60);
    if (!recent.ok) return { ok: false, error: recent.error || "load_failed", email: null };
    const hit = (recent.messages || []).find((m) => {
      try {
        const from = (m.from && m.from.emailAddress) || {};
        const addr = String(from.address || "").toLowerCase();
        const name = String(from.name || "").toLowerCase();
        return addr.includes(needle) || name.includes(needle);
      } catch (_e) {
        return false;
      }
    });
    if (!hit) return { ok: true, email: null, matched: false, note: "no_match_in_recent_window" };
    return {
      ok: true,
      email: hit,
      matched: true,
      summary: summarizeEmail(hit),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), email: null };
  }
}

/**
 * @param {object=} emailObj
 */
function summarizeEmail(emailObj) {
  try {
    if (!emailObj || typeof emailObj !== "object") return { subject: null, preview: "", from: null };
    const from = (emailObj.from && emailObj.from.emailAddress) || {};
    return {
      subject: emailObj.subject != null ? String(emailObj.subject) : "",
      preview: emailObj.bodyPreview != null ? String(emailObj.bodyPreview).slice(0, 480) : "",
      fromName: from.name || "",
      fromAddress: from.address || "",
      receivedDateTime: emailObj.receivedDateTime || null,
      id: emailObj.id || null,
    };
  } catch (_e) {
    return { subject: null, preview: "", from: null };
  }
}

/**
 * Heuristic “needs follow-up” — inbound items that look unanswered (no deterministic thread resolution without more scopes).
 *

 * @param {number=} limit
 */
async function getMessageById(messageId) {
  try {
    const mb = mailboxUser();
    if (!mb) return { ok: false, error: "missing_mailbox", message: null };
    const id = String(messageId || "").trim();
    if (!id) return { ok: false, error: "missing_message_id", message: null };
    const path = `/users/${encodeURIComponent(mb)}/messages/${encodeURIComponent(
      id
    )}?$select=id,subject,from,receivedDateTime,bodyPreview,body,conversationId,isRead,hasAttachments`;
    const r = await graphGet(path, {});
    if (!r.ok) return { ok: false, error: r.error || "message_fetch_failed", message: null };
    const m = r.data;
    return { ok: true, message: m, snippet: summarizeEmail(m), conversationId: m && m.conversationId ? m.conversationId : null };
  } catch (e) {
    return { ok: false, error: e.message || String(e), message: null };
  }
}

async function getUnreadRecent(limit) {
  try {
    const lim = Math.min(100, Math.max(1, Number(limit) || 25));
    const inbox = await getRecentInbox(Math.max(lim, 40));
    if (!inbox.ok) return { ok: false, error: inbox.error || "inbox_failed", messages: [] };
    const unread = (inbox.messages || []).filter((m) => m && m.isRead === false);
    return { ok: true, messages: unread.slice(0, lim), unreadCount: unread.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e), messages: [] };
  }
}

async function getInboxFolderStats() {
  try {
    const mb = mailboxUser();
    if (!mb) return { ok: false, error: "missing_mailbox", folder: null };
    const path = `/users/${encodeURIComponent(mb)}/mailFolders/Inbox?$select=unreadItemCount,totalItemCount,displayName`;
    const r = await graphGet(path, {});
    if (!r.ok) return { ok: false, error: r.error || "folder_failed", folder: null };
    return { ok: true, folder: r.data || null };
  } catch (e) {
    return { ok: false, error: e.message || String(e), folder: null };
  }
}

async function healthProbe() {
  try {
    if (!isConfigured()) return { ok: false, configured: false, stage: "env_missing" };
    const tok = await getAccessToken();
    if (!tok.ok) return { ok: false, configured: true, stage: "token", error: tok.error || "token_failed" };
    const folder = await getInboxFolderStats();
    return {
      ok: !!folder.ok,
      configured: true,
      stage: "inbox_folder",
      folder: folder.folder || null,
      error: folder.error || null,
    };
  } catch (e) {
    return { ok: false, configured: isConfigured(), stage: "exception", error: e.message || String(e) };
  }
}

async function detectFollowUpCandidates(limit) {
  try {
    const inbox = await getRecentInbox(Math.min(80, Number(limit) || 40));
    if (!inbox.ok) return { ok: false, error: inbox.error || "inbox_failed", candidates: [] };
    const msgs = inbox.messages || [];
    /** Flag marketing keywords + non-auto subject heuristics */
    const cand = msgs.filter((m) => {
      try {
        const sub = String(m.subject || "").toLowerCase();
        if (!sub || sub.includes("automatic reply")) return false;
        if (/re:|fw:/i.test(sub)) return true;
        if (/\?$/.test(sub)) return true;
        if (/following up|reminder|circling back/i.test(sub)) return true;
        return false;
      } catch (_e) {
        return false;
      }
    });
    return {
      ok: true,
      candidates: cand.slice(0, Number(limit) || 20).map((m) => summarizeEmail(m)),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), candidates: [] };
  }
}

module.exports = {
  isConfigured,
  getAccessToken,
  invalidateCachedToken,
  searchEmails,
  getLastEmailFromContact,
  getRecentInbox,
  getMessageById,
  getUnreadRecent,
  getInboxFolderStats,
  healthProbe,
  summarizeEmail,
  detectFollowUpCandidates,
};
