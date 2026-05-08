# Cheeky OS ↔ Power Apps — Dashboard integration playbook (<15 min)

Use this with **`docs/cheeky-os-power-apps-connector.openapi.yaml`** and a running Cheeky OS at **`email-intake`** (`npm start`).

**Base URL examples:** `https://your-api.azurewebsites.net` (production) or `http://127.0.0.1:3000` (local — connector often expects HTTPS in cloud; use Azure/ngrok for testing from Make Power Apps cloud).

---

## 0) Prerequisites (2 min)

| # | Check |
|---|--------|
| 1 | Cheeky OS responds: `npm run test:dashboard` from **`email-intake`** prints JSON and ends with **`OK — HTTP 200 and full tiles keys present.`** |
| 2 | `.env` has **`CHEEKY_DASHBOARD_API_KEY`** if you use **`CHEEKY_DASHBOARD_AUTH_MODE=api_key`** and **`CHEEKY_DASHBOARD_REQUIRE_AUTH=true`**. |
| 3 | Power Apps **same tenant** as any Entra connector (if using Bearer). |

**Success criteria:** Connector test returns **200** with **`tiles.OrdersOnHold`** (number) and **`tiles.HealthSummary`** (text) present.

---

## 1) Import custom connector (5 min)

**A. Open import**

1. [Power Apps maker](https://make.powerapps.com) → **Data** → **Custom connectors**.
2. **New custom connector** → **Import an OpenAPI from GitHub / file** → **Import** from file.
3. Select repo file **`docs/cheeky-os-power-apps-connector.openapi.yaml`**.

**B. General**

1. **Connector name:** e.g. **`Cheeky OS Dashboard`** (display name).
2. **Scheme:** **HTTPS** for any cloud-hosted API. (HTTP only for isolated lab.)
3. **Host:** your server host **only** — e.g. `cheeky-api.azurewebsites.net` — **no** `https://` prefix in the host field, **no** path, **no** trailing slash.

**C. Security**

1. Open **Security** tab.
2. **Authentication type:** **API Key**.
3. **Parameter name:** **`X-Cheeky-Dashboard-Key`** (must match backend header).
4. **Parameter location:** **Header**.
5. If you use Entra JWT instead, switch to **OAuth 2.0** and match **`CHEEKY_DASHBOARD_AUTH_MODE=entra`** in Cheeky — not covered in this minimal path.

**D. Definition**

1. Open **Definition** → confirm operations: **`GetDashboardData`**, **`GetHealth`**, **`GetQueue`**.
2. **Save**.

**E. Test connection**

1. **Test** → **New connection** → paste the same key as **`CHEEKY_DASHBOARD_API_KEY`** in the API key field (if auth required).
2. Run **`GetDashboardData`** → expect **200** and JSON body with **`tiles`**.

**F. Publish**

1. **Create connector** (or **Update** if editing).
2. In your **environment**, **use** the connector when adding data sources to the canvas app.

---

## 2) Canvas app — create variables & controls (2 min)

Create **before** pasting formulas (names must match):

| Kind | Name | Type / default |
|------|------|----------------|
| Variable | `varCheekyBaseUrl` | Text — your public site root for `Launch()` |
| Context / global | `locLoading` | Boolean — loading overlay |
| Context / global | `locCheekyErr` | Text — error banner (Blank = OK) |
| Context / global | `locLastOk` | DateTime — last good fetch |
| Collection | `colCheekyTile` | Table — **one row** of flat tile fields |
| Collection | `colOpQueue` | Optional — `GetQueue().jobs` for drill-in |
| Timer | `tmrCheekyRefresh` | **Duration** `45000` (45s), **Repeat** On, **AutoStart** On |

> **Note:** If your studio only allows **named formulas** or **component variables**, keep the same names inside a **shell component** and paste formulas there.

---

## 3) Full Power Fx — use one shared refresh (core)

Replace **`CheekyOS`** with your connector’s **internal name** (often the connector name you picked, e.g. **`Cheeky_OS_Dashboard`** — check **Data** → **Connections**).

### 3a) Named pattern: call from **Refresh button**, **Timer OnTimerEnd**, and **OnStart**

Paste this **identical** block into:

- **`btnRefreshCheeky` → OnSelect**
- **`tmrCheekyRefresh` → OnTimerEnd**
- **`App` → OnStart** (append after `Set(varCheekyBaseUrl, …)`)

```powerfx
Set( locLoading, true );;
Set( locCheekyErr, Blank() );;
IfError(
    With(
        { d: CheekyOS.GetDashboardData() },
        ClearCollect(
            colCheekyTile,
            Table({
                DashboardStatus: d.status,
                OrdersOnHold: d.tiles.OrdersOnHold,
                OrdersWaitingOnArt: d.tiles.OrdersWaitingOnArt,
                Estimates: d.tiles.Estimates,
                BlanksNeeded: d.tiles.BlanksNeeded,
                OrdersNeedingArt: d.tiles.OrdersNeedingArt,
                QueueDepth: d.tiles.QueueDepth,
                LastIntakeTime: d.tiles.LastIntakeTime,
                WorkerStatus: d.tiles.WorkerStatus,
                ActiveJobs: d.tiles.ActiveJobs,
                TotalOrdersToday: d.tiles.TotalOrdersToday,
                TileSource: d.tiles.Source,
                TileGeneratedAt: d.tiles.GeneratedAt,
                HealthSummary: d.tiles.HealthSummary,
                SummaryHeadline: d.summary.headline,
                Version: d.version,
                CurlHint: d.powerAppsTestHint
            })
        );;
        Set( locLastOk, Now() )
    ),
    ClearCollect(
        colCheekyTile,
        Table({
            DashboardStatus: Blank(),
            OrdersOnHold: 0,
            OrdersWaitingOnArt: 0,
            Estimates: 0,
            BlanksNeeded: 0,
            OrdersNeedingArt: 0,
            QueueDepth: 0,
            LastIntakeTime: Blank(),
            WorkerStatus: Blank(),
            ActiveJobs: 0,
            TotalOrdersToday: 0,
            TileSource: "error",
            TileGeneratedAt: Blank(),
            HealthSummary: Blank(),
            SummaryHeadline: Blank(),
            Version: Blank(),
            CurlHint: Blank()
        })
    );;
    Set( locCheekyErr, "Cheeky OS unreachable or connector error. Check URL, key, and VPN." );;
    Notify( locCheekyErr, NotificationType.Error )
);;
Set( locLoading, false )
```

### 3b) **App.OnStart** — base URL + first load + optional queue

```powerfx
Set( varCheekyBaseUrl, "https://YOUR-HOST" );;
IfError(
    ClearCollect( colOpQueue, CheekyOS.GetQueue().jobs ),
    ClearCollect( colOpQueue, Table() )
);;
/* Paste the full IfError block from §3a here (same as Refresh). */
```

### 3c) **Timer** `tmrCheekyRefresh`

| Property | Value |
|----------|--------|
| **Duration** | `45000` |
| **Repeat** | `true` |
| **Auto start** | `true` |
| **OnTimerEnd** | Same IfError block as §3a (duplicate paste). |

---

## 4) Tile label **Text** formulas (copy per label)

Assume **`colCheekyTile`** holds **one row** (`First(colCheekyTile)`).

| UI tile | **Text** property |
|---------|---------------------|
| Orders On Hold | `Text( First( colCheekyTile ).OrdersOnHold )` |
| Orders Waiting On Art | `Text( First( colCheekyTile ).OrdersWaitingOnArt )` |
| Estimates | `Text( First( colCheekyTile ).Estimates )` |
| Blanks Needed | `Text( First( colCheekyTile ).BlanksNeeded )` |
| Orders Needing Art | `Text( First( colCheekyTile ).OrdersNeedingArt )` |
| Queue depth (optional) | `Text( First( colCheekyTile ).QueueDepth )` |
| Active jobs (optional) | `Text( First( colCheekyTile ).ActiveJobs )` |
| Orders today (optional) | `Text( First( colCheekyTile ).TotalOrdersToday )` |
| Ops / health strip (v4.3+) | `First( colCheekyTile ).HealthSummary` |

**Worker status (text):** `First( colCheekyTile ).WorkerStatus`

**Last intake (if ISO string):**  
`With( { t: First( colCheekyTile ).LastIntakeTime }, If( IsBlank( t ), "-", Text( t ) ) )`

**Footer version:** `"v" & First( colCheekyTile ).Version`

**Degraded / partial strip (label):**

- **Visible:** `First( colCheekyTile ).DashboardStatus = "degraded"`
- **Text:** `"Attention: " & First( colCheekyTile ).SummaryHeadline`

---

## 5) Refresh button

**`btnRefreshCheeky` → OnSelect:** paste the **same** IfError block as §3a (do not call a separate timer first).

---

## 6) Loading + error UX

| Control | **Visible** | **Other** |
|---------|-------------|-----------|
| Rectangle overlay | `locLoading` | **Fill** `RGBA( 0, 0, 0, 0.12 )` |
| Label “Refreshing…” | `locLoading` | — |
| Red banner label | `!IsBlank( locCheekyErr )` | **Color** Red, **Text** `locCheekyErr` |

---

## 7) Troubleshooting

| Symptom | What to do |
|---------|------------|
| **All tiles blank / 0 forever** | Confirm **`OnStart`** ran (disable **delay load** temporarily). Check **`First(colCheekyTile)`** in a temporary label: if empty, connector failed — see **`locCheekyErr`**. |
| **Delegation warning** | These formulas use a **single connector call** and **First()** on a **one-row collection** — no list delegation. If you wrapped data in **Filter** on large tables, remove that for the dashboard strip. |
| **401 / unauthorized** | Set **`CHEEKY_DASHBOARD_API_KEY`** in Cheeky `.env`, **`CHEEKY_DASHBOARD_REQUIRE_AUTH=true`**, rebuild/restart. Connector **Test** must use the **same** key in **X-Cheeky-Dashboard-Key**. |
| **`tiles` missing in response** | Wrong path — must be **`GetDashboardData`** → **`/api/cheeky-os/dashboard-data`**, not HTML **`/dashboard`**. |
| **`status` = degraded** | Backend still useful — numbers may be partial. Fix DB (Prisma migrate) and Dataverse column envs (`CHEEKY_DV_INTAKE_*`). See **`cheeky-os/services/dvPublisherColumns.service.js`**. |
| **Localhost + cloud Power Apps** | Cloud canvas app cannot call **`http://127.0.0.1`**. Deploy API or use **ngrok**/Azure and set connector host to that HTTPS origin. |

---

## 8) One-command backend test

From **`email-intake`** (loads `.env` like the server):

```bash
npm run test:dashboard
```

**Expected:**

- JSON printed with **`"tiles": { ... }`** containing **`OrdersOnHold`**, **`BlanksNeeded`**, …
- Stderr ends with: **`OK — HTTP 200 and full tiles keys present.`**

---

## 9) Success criteria (after integration)

1. **Timer** or **Refresh** updates numbers without app restart.
2. **Tiles** match order of magnitude vs Cheeky HTML dashboard / DB (allow small lag).
3. **Degraded** banner may show until Prisma/Dataverse are aligned — data still binds.
4. **`locCheekyErr`** stays **Blank** when API and key are correct.

---

## Reference files

- OpenAPI: **`docs/cheeky-os-power-apps-connector.openapi.yaml`**
- Longer notes: **`docs/power-apps-cheeky-os-integration.md`**
- Backend tiles: **`email-intake/cheeky-os/services/cheekyOsPowerAppsTiles.service.js`**
