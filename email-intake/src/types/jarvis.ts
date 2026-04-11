/** Jarvis ↔ Square operator API — request/response shapes (JSON only). */

export interface JarvisEstimateCreateBody {
  customerName: string;
  quantity: number;
  unitPrice: number;
}

export interface JarvisInvoiceCreateBody {
  customerName: string;
  quantity: number;
  unitPrice: number;
}
