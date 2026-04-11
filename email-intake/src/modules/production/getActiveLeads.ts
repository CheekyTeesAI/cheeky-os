import { getRecentEstimates, getRecentInvoices } from "../command-layer/services/squareEstimate.service";

export type ActiveLead = {
  id: string;
  customerName: string;
  value: number;
  stage: string;
  lastActivityDate: string | null;
};

function toIso(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function toName(value: unknown): string {
  const s = String(value ?? "").trim();
  return s || "Customer";
}

export async function getActiveLeads(): Promise<ActiveLead[]> {
  try {
    const [estimatesRes, invoicesRes] = await Promise.all([
      getRecentEstimates(),
      getRecentInvoices()
    ]);

    const estimateLeads: ActiveLead[] = (estimatesRes.data || []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: `est-${String(r.id ?? "")}`,
        customerName: toName(r.customerId),
        value: typeof r.amount === "number" ? r.amount : 0,
        stage: "Estimate Sent",
        lastActivityDate: toIso(r.createdAt)
      };
    });

    const invoiceFollowups: ActiveLead[] = (invoicesRes.data || [])
      .filter((row) => String((row as Record<string, unknown>).status ?? "").toUpperCase() !== "PAID")
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: `inv-${String(r.id ?? "")}`,
          customerName: toName(r.customerId),
          value: typeof r.amount === "number" ? r.amount : 0,
          stage: "Follow-Up",
          lastActivityDate: toIso(r.createdAt)
        };
      });

    return Array.from(new Map([...estimateLeads, ...invoiceFollowups].map((l) => [l.id, l])).values());
  } catch {
    return [];
  }
}
