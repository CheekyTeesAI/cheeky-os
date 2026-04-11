"use strict";

/**
 * Social OS HTTP routes.
 */

const express = require("express");
const { runBatch } = require("../lib/contentEngine");
const { getDb } = require("../lib/db");

const router = express.Router();

router.post("/social/generate-batch", async (req, res) => {
  try {
    const count = Number(req.body && req.body.count) || 7;
    const result = await runBatch({ count });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[social] generate-batch", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

router.get("/social/approval-queue", async (_req, res) => {
  try {
    const prisma = getDb();
    const items = await prisma.socialPost.findMany({
      where: { status: "draft" },
      orderBy: { scheduledDate: "asc" },
      take: 50
    });
    res.json({
      ok: true,
      count: items.length,
      items
    });
  } catch (err) {
    console.error("[social] approval-queue", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

router.get("/social/weekly-summary", async (_req, res) => {
  try {
    const prisma = getDb();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const drafted = await prisma.socialPost.count({
      where: { status: "draft" }
    });
    const posted = await prisma.socialPost.count({
      where: {
        status: "posted",
        scheduledDate: { gte: weekAgo }
      }
    });

    res.json({
      ok: true,
      windowDays: 7,
      postsDraft: drafted,
      postsPostedScheduledInWindow: posted,
      note: "🦊 Upstate SC — DM us or call 864-498-3475"
    });
  } catch (err) {
    console.error("[social] weekly-summary", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

module.exports = router;
