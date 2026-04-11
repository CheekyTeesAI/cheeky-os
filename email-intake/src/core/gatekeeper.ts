import { BrainOutput } from "../types";

export interface ValidatedInvoicePayload {
  customerName: string;
  quantity: number;
  price: number;
}

export type GatekeeperResult =
  | { ok: true; payload: ValidatedInvoicePayload }
  | { ok: false; stage: "gatekeeper"; error: string };

/**
 * Validates BrainOutput for invoice creation.
 * Rejects low confidence or missing invoice fields.
 */
export function gatekeeper(output: BrainOutput): GatekeeperResult {
  if (output.confidence < 0.8) {
    return { ok: false, stage: "gatekeeper", error: "Low confidence" };
  }
  if (output.intent !== "CREATE_INVOICE") {
    return {
      ok: false,
      stage: "gatekeeper",
      error: "Intent is not CREATE_INVOICE"
    };
  }
  const customerName =
    typeof output.customerName === "string" ? output.customerName.trim() : "";
  const quantity = output.quantity;
  const price = output.unitPrice;

  if (!customerName) {
    return { ok: false, stage: "gatekeeper", error: "Missing customerName" };
  }
  if (
    quantity === undefined ||
    quantity === null ||
    Number.isNaN(Number(quantity))
  ) {
    return { ok: false, stage: "gatekeeper", error: "Missing quantity" };
  }
  if (price === undefined || price === null || Number.isNaN(Number(price))) {
    return { ok: false, stage: "gatekeeper", error: "Missing price" };
  }
  const q = Number(quantity);
  const p = Number(price);
  if (q <= 0 || p <= 0) {
    return {
      ok: false,
      stage: "gatekeeper",
      error: "quantity and price must be positive"
    };
  }

  const payload: ValidatedInvoicePayload = {
    customerName,
    quantity: q,
    price: p
  };
  return { ok: true, payload };
}
