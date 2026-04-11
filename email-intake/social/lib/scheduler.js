"use strict";

/**
 * Social OS scheduled tasks (cron/jobs.js).
 */

const { getDb } = require("./db");
const { runBatch } = require("./contentEngine");

async function sendResendEmail(subject, html) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  const from =
    process.env.RESEND_FROM || "Cheeky Tees <onboarding@resend.dev>";
  const to = String(
    process.env.SOCIAL_APPROVAL_EMAIL || process.env.OUTREACH_EMAIL || ""
  ).trim();
  if (!key || !to) {
    console.warn(
      "[social] RESEND_API_KEY or SOCIAL_APPROVAL_EMAIL missing; skip email"
    );
    return { ok: false, error: "resend_not_configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: t };
  }
  return { ok: true };
}

async function generateWeeklyPosts() {
  return runBatch({ count: 7 });
}

/** Mark approved posts whose time has passed as posted (v1.2 — no postedAt column). */
async function postDueContent() {
  const prisma = getDb();
  const now = new Date();
  const due = await prisma.socialPost.findMany({
    where: {
      status: "approved",
      scheduledDate: { lte: now }
    },
    take: 50
  });
  for (const p of due) {
    await prisma.socialPost.update({
      where: { id: p.id },
      data: { status: "posted" }
    });
  }
  return { posted: due.length };
}

async function weeklyReport() {
  const prisma = getDb();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const drafts = await prisma.socialPost.count({ where: { status: "draft" } });
  const posted = await prisma.socialPost.count({
    where: {
      status: "posted",
      scheduledDate: { gte: weekAgo }
    }
  });
  const html = `<p>🦊 Weekly social snapshot</p><pre>drafts=${drafts}\nposted(scheduled window)=${posted}</pre>`;
  return sendResendEmail("Cheeky Tees Social — weekly report", html);
}

module.exports = {
  generateWeeklyPosts,
  postDueContent,
  weeklyReport,
  sendResendEmail
};
