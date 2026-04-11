/**
 * Carolina Made vendor API boundary.
 * Real HTTP is only used when CAROLINA_MADE_ENABLED=true and credentials are set.
 */

export class CarolinaMadeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarolinaMadeConfigError";
  }
}

export function isCarolinaMadeEnabled(): boolean {
  return (
    String(process.env.CAROLINA_MADE_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

function getLiveConfig(): {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
} {
  if (!isCarolinaMadeEnabled()) {
    throw new CarolinaMadeConfigError(
      "Carolina Made live API requires CAROLINA_MADE_ENABLED=true"
    );
  }
  const baseUrl = String(process.env.CAROLINA_MADE_API_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const apiKey = String(process.env.CAROLINA_MADE_API_KEY ?? "").trim();
  const apiSecret = String(process.env.CAROLINA_MADE_API_SECRET ?? "").trim();
  const missing: string[] = [];
  if (!baseUrl) missing.push("CAROLINA_MADE_API_BASE_URL");
  if (!apiKey) missing.push("CAROLINA_MADE_API_KEY");
  if (!apiSecret) missing.push("CAROLINA_MADE_API_SECRET");
  if (missing.length > 0) {
    throw new CarolinaMadeConfigError(
      `Carolina Made enabled but missing: ${missing.join(", ")}`
    );
  }
  return { baseUrl, apiKey, apiSecret };
}

function stubId(prefix: string, seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${h.toString(36)}`;
}

/** Stub: deterministic fake search results. */
export async function searchProduct(query: string): Promise<Record<string, unknown>> {
  if (!isCarolinaMadeEnabled()) {
    const q = String(query ?? "").trim();
    return {
      simulated: true,
      query: q,
      results: [
        {
          styleCode: "64000",
          name: "Stub Tee (simulated)",
          matchScore: 1,
        },
        {
          styleCode: "SF500",
          name: "Stub Hoodie (simulated)",
          matchScore: 0.5,
        },
      ],
    };
  }

  const { baseUrl, apiKey, apiSecret } = getLiveConfig();
  const url = `${baseUrl}/v1/products/search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-API-Secret": apiSecret,
    },
    body: JSON.stringify({ query: String(query ?? "").trim() }),
  });
  const text = await res.text();
  let body: unknown = { raw: text };
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    throw new Error(
      `Carolina Made searchProduct failed HTTP ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return body as Record<string, unknown>;
}

/** Stub: inventory check simulation. */
export async function checkInventory(
  styleCode: string,
  color?: string,
  sizeBreakdown?: Record<string, number>
): Promise<Record<string, unknown>> {
  if (!isCarolinaMadeEnabled()) {
    const style = String(styleCode ?? "").trim() || "64000";
    return {
      simulated: true,
      styleCode: style,
      color: color ?? null,
      sizeBreakdown: sizeBreakdown ?? null,
      available: true,
      estimatedShipDays: 3,
      message: "Simulated inventory OK (CAROLINA_MADE_ENABLED!=true)",
    };
  }

  const { baseUrl, apiKey, apiSecret } = getLiveConfig();
  const url = `${baseUrl}/v1/inventory/check`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-API-Secret": apiSecret,
    },
    body: JSON.stringify({
      styleCode: String(styleCode ?? "").trim(),
      color: color ?? undefined,
      sizeBreakdown: sizeBreakdown ?? undefined,
    }),
  });
  const text = await res.text();
  let body: unknown = { raw: text };
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    throw new Error(
      `Carolina Made checkInventory failed HTTP ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return body as Record<string, unknown>;
}

/**
 * Placeholder live order call. Stub mode should not invoke this from the service layer.
 * When disabled, returns a simulated confirmation (for tests that call the client directly).
 */
export async function createOrder(payload: unknown): Promise<Record<string, unknown>> {
  if (!isCarolinaMadeEnabled()) {
    const seed = JSON.stringify(payload ?? {});
    return {
      simulated: true,
      externalOrderId: stubId("SIM-CM", seed),
      status: "SUBMITTED",
      message: "Simulated Carolina Made order (enable CAROLINA_MADE_ENABLED for live)",
      receivedAt: new Date().toISOString(),
    };
  }

  const { baseUrl, apiKey, apiSecret } = getLiveConfig();
  const url = `${baseUrl}/v1/orders`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-API-Secret": apiSecret,
    },
    body: JSON.stringify(payload ?? {}),
  });
  const text = await res.text();
  let body: unknown = { raw: text };
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    throw new Error(
      `Carolina Made createOrder failed HTTP ${res.status}: ${text.slice(0, 300)}`
    );
  }
  const rec = body as Record<string, unknown>;
  const ext =
    (rec.externalOrderId as string | undefined) ??
    (rec.orderId as string | undefined) ??
    (rec.id as string | undefined) ??
    null;
  return {
    ...rec,
    externalOrderId: ext,
  };
}
