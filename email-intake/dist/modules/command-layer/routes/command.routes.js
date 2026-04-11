"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const followup_controller_1 = require("../controllers/followup.controller");
const warRoom_controller_1 = require("../controllers/warRoom.controller");
const router = (0, express_1.Router)();
router.get("/war-room", warRoom_controller_1.getWarRoom);
router.post("/auto-followup", followup_controller_1.autoFollowup);
exports.default = router;
