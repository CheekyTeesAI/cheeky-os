"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get("/", (req, res) => {
    const proto = String(req.headers["x-forwarded-proto"] || "http");
    const host = String(req.headers.host || "localhost");
    const baseUrl = `${proto}://${host}`;
    res.json({
        baseUrl,
        webhookUrl: `${baseUrl}/cheeky/webhooks/square`
    });
});
exports.default = router;
