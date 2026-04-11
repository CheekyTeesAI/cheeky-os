import { Router } from "express";
import {
  createDraftEstimate,
  createLead,
  executeAction,
  getDashboard,
  getNextActions,
  getPipeline,
  logActivity,
  runBusiness
} from "../controllers/commandLayer.controller";
import { executeCommand } from "../controllers/command.controller";
import { autoFollowup } from "../controllers/followup.controller";
import { runDay } from "../controllers/operator.controller";
import { getWarRoom } from "../controllers/warRoom.controller";

const router = Router();

router.post("/leads", createLead);
router.post("/activity", logActivity);
router.get("/pipeline", getPipeline);
router.get("/dashboard/today", getDashboard);
router.get("/war-room", getWarRoom);
router.post("/auto-followup", autoFollowup);
router.post("/next-actions", getNextActions);
router.post("/execute-action", executeAction);
router.post("/run-business", runBusiness);
router.post("/execute", executeCommand);
router.post("/run-day", runDay);
router.post("/square/draft-estimate", createDraftEstimate);

export default router;