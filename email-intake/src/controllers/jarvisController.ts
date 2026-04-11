import type { Request, Response } from "express";
import {
  createDraftEstimate,
  createDraftInvoice,
  listDraftInvoicesForFollowup,
  searchCustomers
} from "../services/jarvisSquareService";

export async function getEstimatesFollowup(_req: Request, res: Response): Promise<void> {
  try {
    const invoices = await listDraftInvoicesForFollowup();
    res.json({ success: true, invoices });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: message });
  }
}

export async function getCustomersSearch(req: Request, res: Response): Promise<void> {
  try {
    const q = String(req.query.q ?? "").trim();
    const customers = await searchCustomers(q);
    res.json({ success: true, customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: message });
  }
}

export async function postEstimateCreate(req: Request, res: Response): Promise<void> {
  try {
    const { customerName, quantity, unitPrice } = req.body || {};
    if (
      typeof customerName !== "string" ||
      typeof quantity !== "number" ||
      typeof unitPrice !== "number"
    ) {
      res.status(400).json({
        success: false,
        error: "customerName (string), quantity (number), unitPrice (number) required"
      });
      return;
    }
    const out = await createDraftEstimate({ customerName, quantity, unitPrice });
    res.json({ success: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: message });
  }
}

export async function postInvoiceCreate(req: Request, res: Response): Promise<void> {
  try {
    const { customerName, quantity, unitPrice } = req.body || {};
    if (
      typeof customerName !== "string" ||
      typeof quantity !== "number" ||
      typeof unitPrice !== "number"
    ) {
      res.status(400).json({
        success: false,
        error: "customerName (string), quantity (number), unitPrice (number) required"
      });
      return;
    }
    const out = await createDraftInvoice({ customerName, quantity, unitPrice });
    res.json({ success: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: message });
  }
}
