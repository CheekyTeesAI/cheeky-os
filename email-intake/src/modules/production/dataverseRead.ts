export type DataverseRow = Record<string, unknown>;

export function pick(row: DataverseRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const hit = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
    if (hit && row[hit] !== undefined && row[hit] !== null) return row[hit];
  }
  return undefined;
}

export function formattedChoice(row: DataverseRow, logical: string): string {
  const key = `${logical}@OData.Community.Display.V1.FormattedValue`;
  const v = row[key];
  return typeof v === "string" ? v : "";
}

export async function getDataverseAccessToken(): Promise<string | null> {
  const base = process.env.DATAVERSE_URL || "";
  const tenant = process.env.DATAVERSE_TENANT_ID || "";
  const clientId = process.env.DATAVERSE_CLIENT_ID || "";
  const secret = process.env.DATAVERSE_CLIENT_SECRET || "";

  if (process.env.DATAVERSE_TOKEN) return process.env.DATAVERSE_TOKEN;
  if (!base || !tenant || !clientId || !secret) return null;

  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: secret,
    scope: `${base}/.default`
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function dataverseReadAll(
  entitySet: string,
  selectFields: string,
  extraQuery?: string
): Promise<DataverseRow[]> {
  const base = process.env.DATAVERSE_URL || "";
  const token = await getDataverseAccessToken();
  if (!base || !token) return [];

  const root = `${base.replace(/\/$/, "")}/api/data/v9.2/${entitySet}`;
  const first = `${root}?$select=${encodeURIComponent(selectFields)}${
    extraQuery ? `&${extraQuery}` : ""
  }`;

  const rows: DataverseRow[] = [];
  const seen = new Set<string>();
  let nextUrl: string | null = first;

  while (nextUrl) {
    if (seen.has(nextUrl)) break;
    seen.add(nextUrl);

    const res = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        Prefer: 'odata.include-annotations="*"'
      }
    });

    if (!res.ok) return [];

    const payload = (await res.json()) as {
      value?: DataverseRow[];
      "@odata.nextLink"?: string;
      "odata.nextLink"?: string;
    };
    if (Array.isArray(payload.value)) rows.push(...payload.value);

    const rawNext = payload["@odata.nextLink"] || payload["odata.nextLink"] || "";
    nextUrl = typeof rawNext === "string" && rawNext.trim() ? rawNext : null;
  }

  return rows;
}
