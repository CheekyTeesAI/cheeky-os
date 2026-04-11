import { Router } from "express";
import { autoFollowup } from "../controllers/followup.controller";
import { getWarRoom } from "../controllers/warRoom.controller";

const router = Router();

router.get("/war-room", getWarRoom);
router.post("/auto-followup", autoFollowup);

export default router;
