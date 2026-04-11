import { Request, Response } from "express";
import { createDraftEstimate } from "../services/jarvisSquareService";

export async function createInvoice(req: Request, res: Response) {
  try {
    const { quote } = req.body;

    if (!quote || !quote.total) {
      return res.status(400).json({
        success: false,
        error: "Missing quote"
      });
    }

    const amount = Number(quote.total);
    const customerName = String(quote.customerName || "Square Customer").trim() || "Square Customer";
    const items = Array.isArray(quote.items) ? quote.items : [];
    const firstItem = String(items[0] ?? "");
    const qtyMatch = firstItem.match(/\d+/);
    const quantity = qtyMatch ? Math.max(1, parseInt(qtyMatch[0], 10)) : 1;
    const unitPrice = quantity > 0 ? amount / quantity : amount;

    try {
      const created = await createDraftEstimate({
        customerName,
        quantity,
        unitPrice
      });

      return res.json({
        success: true,
        mode: "square",
        invoice: {
          id: created.invoiceId,
          status: "DRAFT",
          amount
        }
      });
    } catch (squareErr) {
      console.error("Square draft creation failed, using mock:", squareErr);

      const invoice = {
        id: "inv_" + Date.now(),
        amount,
        status: "DRAFT",
        createdAt: new Date().toISOString()
      };

      console.log("Draft invoice created:", invoice);

      return res.json({
        success: true,
        mode: "mock",
        invoice
      });
    }

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Invoice creation failed"
    });
  }
}
