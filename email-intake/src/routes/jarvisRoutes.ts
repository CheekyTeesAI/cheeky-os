import { Router } from "express";
import {
  getCustomersSearch,
  getEstimatesFollowup,
  postEstimateCreate,
  postInvoiceCreate
} from "../controllers/jarvisController";
import {
  approveJarvisAction,
  handleJarvisMessage
} from "../modules/jarvis/controllers/jarvis.controller";

const router = Router();

router.post("/", handleJarvisMessage);
router.post("/approve", approveJarvisAction);
router.get("/estimates/followup", getEstimatesFollowup);
router.get("/customers/search", getCustomersSearch);
router.post("/estimate/create", postEstimateCreate);
router.post("/invoice/create", postInvoiceCreate);

export default router;
