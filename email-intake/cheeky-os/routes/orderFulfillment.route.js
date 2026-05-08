"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();
const store = require(path.join(__dirname, "..", "services", "fulfillmentRecords.store"));
const engine = require(path.join(__dirname, "..", "services", "fulfillmentEngine.service"));

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

const METHODS = new Set(["PICKUP", "LOCAL_DELIVERY", "SHIP", "UNKNOWN"]);
const STATUS_PATCH = new Set(["SHIPPED", "PICKED_UP", "NEEDS_REVIEW"]);

function mapShippingToRecord(shipping) {
  const s = shipping && typeof shipping === "object" ? shipping : {};
  const out = {};
  if (s.name != null) out.shippingName = String(s.name).trim();
  if (s.address1 != null) out.shippingAddress1 = String(s.address1).trim();
  if (s.address2 != null) out.shippingAddress2 = String(s.address2).trim();
  if (s.city != null) out.shippingCity = String(s.city).trim();
  if (s.state != null) out.shippingState = String(s.state).trim();
  if (s.zip != null) out.shippingZip = String(s.zip).trim();
  if (s.country != null) out.shippingCountry = String(s.country).trim();
  if (s.phone != null) out.shippingPhone = String(s.phone).trim();
  return out;
}

function mapPackageToRecord(pkg) {
  const p = pkg && typeof pkg === "object" ? pkg : {};
  const out = {};
  if (p.weightOz != null) out.packageWeightOz = Number(p.weightOz);
  if (p.lengthIn != null) out.packageLengthIn = Number(p.lengthIn);
  if (p.widthIn != null) out.packageWidthIn = Number(p.widthIn);
  if (p.heightIn != null) out.packageHeightIn = Number(p.heightIn);
  return out;
}

router.patch("/:id/fulfillment", async (req, res) => {
  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return res.status(200).json({ ok: false, error: "database_unavailable" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(200).json({ ok: false, error: "id_required" });

  let order;
  try {
    order = await prisma.order.findFirst({ where: { id, deletedAt: null } });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  if (!order) return res.status(200).json({ ok: false, error: "not_found" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const patch = {};

  if (body.fulfillmentMethod != null) {
    const m = String(body.fulfillmentMethod || "").toUpperCase().trim();
    if (!METHODS.has(m)) {
      return res.status(200).json({ ok: false, error: "invalid_fulfillment_method" });
    }
    patch.fulfillmentMethod = m;
  }

  Object.assign(patch, mapShippingToRecord(body.shipping));
  Object.assign(patch, mapPackageToRecord(body.package));

  if (body.note != null && String(body.note).trim()) {
    const prev = store.getRecord(id);
    const merged = [prev.fulfillmentNote, String(body.note).trim()].filter(Boolean).join(" | ");
    patch.fulfillmentNote = merged.slice(0, 4000);
  }

  let rec;
  try {
    rec = Object.keys(patch).length ? store.saveRecord(id, patch) : store.getRecord(id);
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  const evaluated = await engine.evaluateFulfillment(id, { skipDrafts: false });
  return res.status(200).json({
    ok: evaluated.ok !== false,
    orderId: id,
    fulfillment: evaluated.record || rec,
    evaluation: {
      fulfillmentStatus: evaluated.fulfillmentStatus,
      fulfillmentMethod: evaluated.fulfillmentMethod,
      reason: evaluated.reason,
    },
  });
});

router.patch("/:id/fulfillment/status", async (req, res) => {
  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return res.status(200).json({ ok: false, error: "database_unavailable" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(200).json({ ok: false, error: "id_required" });

  let order;
  try {
    order = await prisma.order.findFirst({ where: { id, deletedAt: null } });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  if (!order) return res.status(200).json({ ok: false, error: "not_found" });

  if (!engine.isOrderCompletedLike(order)) {
    return res.status(200).json({ ok: false, error: "order_not_completed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const st = String(body.fulfillmentStatus || "").toUpperCase().trim();
  if (!STATUS_PATCH.has(st)) {
    return res.status(200).json({ ok: false, error: "invalid_fulfillment_status" });
  }

  const trk = body.trackingNumber != null ? String(body.trackingNumber).trim() : "";
  const noteAdd = body.note != null ? String(body.note).trim() : "";
  const waive = /TRACKING_WAIVED|NO_TRACKING_OK/i.test(noteAdd);

  if (st === "SHIPPED" && !trk && !waive) {
    return res.status(200).json({
      ok: false,
      error: "tracking_required_or_note_waiver",
      hint: 'Add trackingNumber or note with TRACKING_WAIVED if intentionally blank',
    });
  }

  const due = engine.balanceDueOnOrder(order);
  if (due > 0.02 && (st === "SHIPPED" || st === "PICKED_UP")) {
    return res.status(200).json({ ok: false, error: "balance_due_blocked", balanceDue: due });
  }

  const prev = store.getRecord(id);
  const patch = {
    fulfillmentStatus: st,
  };
  if (trk) patch.trackingNumber = trk;
  if (body.carrier != null && String(body.carrier).trim()) patch.carrier = String(body.carrier).trim();
  if (noteAdd) {
    patch.fulfillmentNote = [prev.fulfillmentNote, noteAdd].filter(Boolean).join(" | ").slice(0, 4000);
  }
  if (st === "SHIPPED" || st === "PICKED_UP") {
    patch.fulfilledAt = new Date().toISOString();
  }

  let rec;
  try {
    rec = store.saveRecord(id, patch);
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  console.log(
    `[fulfillment] STATUS UPDATED orderId=${id} status=${st} tracking=${trk ? "yes" : "no"}`
  );

  return res.status(200).json({ ok: true, orderId: id, fulfillment: rec });
});

module.exports = router;
