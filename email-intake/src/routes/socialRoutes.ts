import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

router.get("/approve/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ success: false, error: "missing id" });
    }
    const existing = await prisma.socialPost.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    await prisma.socialPost.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    return res.status(200).json({
      success: true,
      message: "Post approved and scheduled",
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : "error",
    });
  }
});

router.get("/posts", async (_req, res) => {
  try {
    const posts = await prisma.socialPost.findMany({
      orderBy: { scheduledAt: "desc" },
    });
    return res.status(200).json({ posts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("SocialPost") ||
      msg.includes("does not exist") ||
      msg.includes("Unknown table")
    ) {
      return res.status(200).json({ posts: [] });
    }
    return res.status(500).json({
      posts: [],
      error: msg,
    });
  }
});

export default router;
