"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const store_1 = require("../debug/store");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get("/cheeky/debug/last", (req, res) => {
    const provided = (0, auth_1.readProvidedApiKey)(req);
    const expected = (0, auth_1.readExpectedApiKey)();
    if (!provided || provided !== expected) {
        res.status(401).json({
            ok: false,
            success: false,
            stage: "auth",
            error: "Invalid API key"
        });
        return;
    }
    res.json({ lastRun: (0, store_1.getLastRun)() });
});
exports.default = router;
