import { ApiError } from "square";
import { getSquareClient, resolveSquareLocationId } from "../../../services/square.service";

type SquareReadResult<T> = {
  success: boolean;
  data: T[];
};

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
};

type InvoiceRow = {
  id: string;
  customerId: string;
  amount: number;
  status: string;
  createdAt: string;
};

function mapSquareError(step: string, err: unknown): Error {
  if (err instanceof ApiError) {
    const detail = err.errors?.map((e) => e.detail || e.code).join("; ") || err.message;
    return new Error(`Square ${step}: ${detail}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function moneyAmount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const amount = (value as { amount?: unknown }).amount;
  if (typeof amount === "bigint") return Number(amount) / 100;
  if (typeof amount === "number") return amount / 100;
  return 0;
}

function mapInvoice(inv: Record<string, unknown>): InvoiceRow {
  return {
    id: String(inv.id ?? ""),
    customerId: String(inv.primaryRecipientCustomerId ?? ""),
    amount:
      moneyAmount(inv.computedAmountMoney) ||
      moneyAmount(inv.publicAmountMoney) ||
      moneyAmount(inv.invoiceAmountMoney) ||
      moneyAmount(inv.documentAmountMoney),
    status: String(inv.status ?? ""),
    createdAt: String(inv.createdAt ?? "")
  };
}

async function readAllCustomers(client: ReturnType<typeof getSquareClient>) {
  const all: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const res = await client.customersApi.searchCustomers({
      limit: BigInt(100),
      cursor
    });
    const page = (res.result?.customers || []) as unknown as Array<Record<string, unknown>>;
    all.push(...page);

    const next = (res.result as { cursor?: unknown } | undefined)?.cursor;
    const nextCursor = typeof next === "string" && next.trim() ? next : undefined;
    if (!nextCursor || seen.has(nextCursor)) break;
    seen.add(nextCursor);
    cursor = nextCursor;
  }

  return all;
}

async function readAllInvoices(
  client: ReturnType<typeof getSquareClient>,
  locationId: string
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const res = await client.invoicesApi.searchInvoices({
      query: {
        filter: {
          locationIds: [locationId]
        },
        sort: {
          field: "INVOICE_SORT_DATE",
          order: "DESC"
        }
      },
      limit: 200,
      cursor
    });
    const page = (res.result?.invoices || []) as unknown as Array<Record<string, unknown>>;
    all.push(...page);

    const next = (res.result as { cursor?: unknown } | undefined)?.cursor;
    const nextCursor = typeof next === "string" && next.trim() ? next : undefined;
    if (!nextCursor || seen.has(nextCursor)) break;
    seen.add(nextCursor);
    cursor = nextCursor;
  }

  return all;
}

export async function getRecentCustomers(): Promise<SquareReadResult<CustomerRow>> {
  const client = getSquareClient();
  try {
    const customers = await readAllCustomers(client);
    const data = customers.map((c) => ({
      id: String(c.id ?? ""),
      name: String(
        c.givenName || c.familyName
          ? `${c.givenName || ""} ${c.familyName || ""}`.trim()
          : c.nickname || ""
      ),
      email: String(c.emailAddress ?? ""),
      phone: String(c.phoneNumber ?? ""),
      company: String(c.companyName ?? "")
    }));
    return { success: true, data };
  } catch (err) {
    throw mapSquareError("getRecentCustomers", err);
  }
}

export async function getRecentInvoices(): Promise<SquareReadResult<InvoiceRow>> {
  const client = getSquareClient();
  const locationId = await resolveSquareLocationId(client);
  try {
    const invoices = (await readAllInvoices(client, locationId)).map((inv) => mapInvoice(inv));
    return { success: true, data: invoices };
  } catch (err) {
    throw mapSquareError("getRecentInvoices", err);
  }
}

export async function getRecentEstimates(): Promise<SquareReadResult<InvoiceRow>> {
  const client = getSquareClient();
  const locationId = await resolveSquareLocationId(client);
  try {
    const invoices = (await readAllInvoices(client, locationId))
      .filter((inv) => {
        const status = String(inv.status ?? "").toUpperCase();
        const title = String(inv.title ?? "").toLowerCase();
        return status === "DRAFT" || title.startsWith("estimate");
      })
      .map((inv) => mapInvoice(inv));
    return { success: true, data: invoices };
  } catch (err) {
    throw mapSquareError("getRecentEstimates", err);
  }
}

export class SquareEstimateServicePlaceholder {
  async getRecentCustomers(): Promise<SquareReadResult<CustomerRow>> {
    return getRecentCustomers();
  }

  async getRecentInvoices(): Promise<SquareReadResult<InvoiceRow>> {
    return getRecentInvoices();
  }

  async getRecentEstimates(): Promise<SquareReadResult<InvoiceRow>> {
    return getRecentEstimates();
  }
}