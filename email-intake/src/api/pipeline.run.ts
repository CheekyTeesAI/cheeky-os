import { Request, Response } from "express";
import { createOrder } from "./orders.create";
import { generateQuote } from "./quote.generate";
import { createInvoice } from "./invoice.create";

export async function runPipeline(req: Request, res: Response) {
  try {
    const { customerName, email, items, notes } = req.body;

    if (!items) {
      return res.status(400).json({
        success: false,
        error: "Missing items"
      });
    }

    // STEP 1 — ORDER
    let orderResult: any = {};
    await createOrder(
      { body: { customerName, email, items, notes } } as any,
      {
        json: (data: any) => (orderResult = data),
        status: () => ({ json: (data: any) => (orderResult = data) })
      } as any
    );

    // STEP 2 — QUOTE
    let quoteResult: any = {};
    await generateQuote(
      { body: { items } } as any,
      {
        json: (data: any) => (quoteResult = data),
        status: () => ({ json: (data: any) => (quoteResult = data) })
      } as any
    );

    // STEP 3 — INVOICE
    let invoiceResult: any = {};
    await createInvoice(
      { body: { quote: quoteResult.quote } } as any,
      {
        json: (data: any) => (invoiceResult = data),
        status: () => ({ json: (data: any) => (invoiceResult = data) })
      } as any
    );

    return res.json({
      success: true,
      pipeline: {
        order: orderResult.order,
        quote: quoteResult.quote,
        invoice: invoiceResult.invoice
      }
    });

  } catch (err) {
    console.error("Pipeline failed", err);

    return res.status(500).json({
      success: false,
      error: "Pipeline failed"
    });
  }
}
