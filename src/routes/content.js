/**
 * Social content — generate, approve, queue, preview/publish (no auto-post by default).
 */
const express = require("express");
const { getTodayContent, forceGenerateToday } = require("../services/contentOrchestrator");
const { checkReminder } = require("../services/contentReminderService");
const { getTodayPost, markPosted, listHistory, skipPost } = require("../services/contentStore");
const { approvePost, rejectPost, requestEdit } = require("../services/contentApprovalService");
const { queuePost, getQueue, dequeuePost } = require("../services/contentQueueService");
const { publishPost } = require("../services/contentPublishService");
const { getContentStats } = require("../services/contentAnalyticsService");

const router = express.Router();

router.get("/today", (_req, res) => {
  try {
    const { fresh, post, record } = getTodayContent();
    const reminder = checkReminder();
    return res.status(200).json({
      success: true,
      fresh,
      postId: record && record.id,
      post,
      status: record && record.status,
      reminder,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "today_failed",
    });
  }
});

router.post("/generate", (_req, res) => {
  try {
    const { fresh, post, record } = forceGenerateToday();
    return res.status(200).json({
      success: true,
      fresh,
      postId: record && record.id,
      post,
      status: record && record.status,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "generate_failed",
    });
  }
});

router.post("/approve", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let id = String(body.postId || "").trim();
    if (!id) {
      const row = getTodayPost();
      id = row && row.id ? String(row.id) : "";
    }
    if (!id) return res.status(200).json({ success: false, error: "postId_required" });
    const out = approvePost(id);
    return res.status(200).json({ success: out.ok, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "approve_failed" });
  }
});

router.post("/reject", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let id = String(body.postId || "").trim();
    if (!id) {
      const row = getTodayPost();
      id = row && row.id ? String(row.id) : "";
    }
    if (!id) return res.status(200).json({ success: false, error: "postId_required" });
    const out = rejectPost(id);
    return res.status(200).json({ success: out.ok, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "reject_failed" });
  }
});

router.post("/request-edit", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let id = String(body.postId || "").trim();
    if (!id) {
      const row = getTodayPost();
      id = row && row.id ? String(row.id) : "";
    }
    if (!id) return res.status(200).json({ success: false, error: "postId_required" });
    const out = requestEdit(id);
    return res.status(200).json({ success: out.ok, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "request_edit_failed" });
  }
});

router.post("/queue", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let id = String(body.postId || "").trim();
    if (!id) {
      const row = getTodayPost();
      id = row && row.id ? String(row.id) : "";
    }
    if (!id) return res.status(200).json({ success: false, error: "postId_required" });
    const out = queuePost(id);
    return res.status(200).json({ success: out.ok, ...out, error: out.error || null });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "queue_failed" });
  }
});

router.get("/queue", (_req, res) => {
  try {
    const q = getQueue();
    return res.status(200).json({ success: true, count: q.length, posts: q });
  } catch (e) {
    return res.status(200).json({ success: false, posts: [], error: e && e.message ? e.message : "queue_get_failed" });
  }
});

router.post("/dequeue", (_req, res) => {
  try {
    const row = dequeuePost();
    return res.status(200).json({ success: Boolean(row), post: row });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "dequeue_failed" });
  }
});

router.post("/post", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let id = String(body.postId || "").trim();
    if (!id) {
      const row = getTodayPost();
      id = row && row.id ? String(row.id) : "";
    }
    if (!id) return res.status(200).json({ success: false, error: "postId_required" });
    const mode = String(body.mode || "PREVIEW").toUpperCase();
    const out = publishPost(id, mode);
    if (body.markPosted === true && mode === "MANUAL" && out.success) {
      markPosted(id);
    }
    return res.status(200).json({ success: out.success, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "post_failed" });
  }
});

router.post("/skip", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let id = String(body.postId || "").trim();
    if (!id) {
      const row = getTodayPost();
      id = row && row.id ? String(row.id) : "";
    }
    if (!id) return res.status(200).json({ success: false, error: "no_post_to_skip" });
    const updated = skipPost(id);
    return res.status(200).json({
      success: Boolean(updated),
      postId: id,
      status: updated && updated.status,
    });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "skip_failed" });
  }
});

router.post("/complete", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let id = String(body.postId || "").trim();
    if (!id) {
      const row = getTodayPost();
      id = row && row.id ? String(row.id) : "";
    }
    if (!id) return res.status(200).json({ success: false, error: "no_post_to_complete" });
    const updated = markPosted(id);
    return res.status(200).json({
      success: Boolean(updated),
      postId: id,
      status: updated && updated.status,
    });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "complete_failed" });
  }
});

router.get("/history", (req, res) => {
  try {
    const limit = req.query && req.query.limit ? Number(req.query.limit) : 40;
    const posts = listHistory(limit);
    return res.status(200).json({ success: true, count: posts.length, posts });
  } catch (e) {
    return res.status(200).json({ success: false, posts: [], error: e && e.message ? e.message : "history_failed" });
  }
});

router.get("/stats", (_req, res) => {
  try {
    const stats = getContentStats();
    return res.status(200).json({ success: true, ...stats });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "stats_failed" });
  }
});

router.get("/backlog", (_req, res) => {
  try {
    const { getUnusedPosts } = require("../services/contentStore");
    const unused = getUnusedPosts().slice(-40);
    return res.status(200).json({
      success: true,
      count: unused.length,
      posts: unused,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      posts: [],
      error: e && e.message ? e.message : "backlog_failed",
    });
  }
});

module.exports = router;
