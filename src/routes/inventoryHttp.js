const express = require("express");
const router = express.Router();

const {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  applyAllocationDeltas,
} = require("../services/inventoryService");

router.get("/", (_req, res) => {
  try {
    const items = getInventory();
    return res.status(200).json({ success: true, items, mock: false });
  } catch (e) {
    return res.status(200).json({ success: false, items: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const row = addInventoryItem(body);
    return res.status(200).json({ success: true, item: row });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/allocate", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const deltas = Array.isArray(body.deltas) ? body.deltas : body.allocations;
    const out = applyAllocationDeltas(deltas || []);
    return res.status(200).json({ success: true, results: out });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.patch("/:id", (req, res) => {
  try {
    const row = updateInventoryItem(req.params.id, req.body || {});
    if (!row) return res.status(200).json({ success: false, error: "not_found" });
    return res.status(200).json({ success: true, item: row });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
