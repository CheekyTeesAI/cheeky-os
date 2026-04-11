"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pick = pick;
exports.formattedChoice = formattedChoice;
exports.getDataverseAccessToken = getDataverseAccessToken;
exports.dataverseReadAll = dataverseReadAll;
function pick(row, ...keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null)
            return row[key];
        const hit = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
        if (hit && row[hit] !== undefined && row[hit] !== null)
            return row[hit];
    }
    return undefined;
}
function formattedChoice(row, logical) {
    const key = `${logical}@OData.Community.Display.V1.FormattedValue`;
    const v = row[key];
    return typeof v === "string" ? v : "";
}
async function getDataverseAccessToken() {
    const base = process.env.DATAVERSE_URL || "";
    const tenant = process.env.DATAVERSE_TENANT_ID || "";
    const clientId = process.env.DATAVERSE_CLIENT_ID || "";
    const secret = process.env.DATAVERSE_CLIENT_SECRET || "";
    if (process.env.DATAVERSE_TOKEN)
        return process.env.DATAVERSE_TOKEN;
    if (!base || !tenant || !clientId || !secret)
        return null;
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
    if (!res.ok)
        return null;
    const data = (await res.json());
    return data.access_token ?? null;
}
async function dataverseReadAll(entitySet, selectFields, extraQuery) {
    const base = process.env.DATAVERSE_URL || "";
    const token = await getDataverseAccessToken();
    if (!base || !token)
        return [];
    const root = `${base.replace(/\/$/, "")}/api/data/v9.2/${entitySet}`;
    const first = `${root}?$select=${encodeURIComponent(selectFields)}${extraQuery ? `&${extraQuery}` : ""}`;
    const rows = [];
    const seen = new Set();
    let nextUrl = first;
    while (nextUrl) {
        if (seen.has(nextUrl))
            break;
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
        if (!res.ok)
            return [];
        const payload = (await res.json());
        if (Array.isArray(payload.value))
            rows.push(...payload.value);
        const rawNext = payload["@odata.nextLink"] || payload["odata.nextLink"] || "";
        nextUrl = typeof rawNext === "string" && rawNext.trim() ? rawNext : null;
    }
    return rows;
}
