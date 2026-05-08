"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
router.get("/approve/:id", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) {
            return res.status(400).json({ success: false, error: "missing id" });
        }
        const existing = await prisma_1.default.socialPost.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, error: "Not found" });
        }
        await prisma_1.default.socialPost.update({
            where: { id },
            data: { status: "APPROVED", approvedAt: new Date() },
        });
        return res.status(200).json({
            success: true,
            message: "Post approved and scheduled",
        });
    }
    catch (e) {
        return res.status(500).json({
            success: false,
            error: e instanceof Error ? e.message : "error",
        });
    }
});
router.get("/posts", async (_req, res) => {
    try {
        const posts = await prisma_1.default.socialPost.findMany({
            orderBy: { scheduledAt: "desc" },
        });
        return res.status(200).json({ posts });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("SocialPost") ||
            msg.includes("does not exist") ||
            msg.includes("Unknown table")) {
            return res.status(200).json({ posts: [] });
        }
        return res.status(500).json({
            posts: [],
            error: msg,
        });
    }
});
exports.default = router;
