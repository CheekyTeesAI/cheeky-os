# Cheeky OS ↔ Power Apps Canvas — Live dashboard tiles (v4.2)

**Turnkey walkthrough (connector + full Power Fx):** `docs/power-apps-dashboard-integration-playbook.md`

This guide wires your **existing** canvas app to Cheeky OS **v4.2+** so status tiles read from the same DB and observability rings as the HTML operator dashboard.

## What the backend exposes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/cheeky-os/dashboard-data` | **`X-Cheeky-Dashboard-Key`** or Entra Bearer | **`status`**, **`summary`**, **`powerAppsTestHint`**, **`tiles`**, observability |
| GET | `/health` | None by default | Liveness + **`observability`** |
| GET | `/api/operator/queue` | None by default | **`count`**, **`jobs[]`** (Dataverse-aligned intakes) |

Server auth is controlled by **`CHEEKY_DASHBOARD_AUTH_MODE`**, **`CHEEKY_DASHBOARD_API_KEY`**, and related env vars (`email-intake/cheeky-os/services/cheekyOsDashboardAuth.service.js`).

### Top-level response (v4.2)

| Field | Meaning |
|-------|---------|
| **`status`** | **`success`** — all tile sources healthy; **`degraded`** — `tiles.Source` is `partial`, `error`, or `database_unavailable`, or `tiles.Notes` is non-empty |
| **`summary`** | Short overview (headline, worker, queue depth, active production jobs, orders created today, last intake, attention sum) |
| **`powerAppsTestHint`** | One-line **`curl`** example (host/proto from the request); substitute `YOUR_KEY` |
| **`tiles`** | Fixed-shape PascalCase object (always present, even on failure paths) |

### `tiles` object

| Property | Meaning |
|---------|---------|
| `OrdersOnHold` | Distinct orders (non-terminal) with **`Task.productionHold = true`** |
| `OrdersWaitingOnArt` | **`PRODUCTION_READY`**, garments not ordered, no **`ArtFile`** with **`approvalStatus = APPROVED`** |
| `Estimates` | **`Estimate`** rows whose **`status`** is not terminal |
| `BlanksNeeded` | **`garmentsOrdered` ≠ true** and (prod-relevant **`status`** or **`jobCreated`**) |
| `OrdersNeedingArt` | **`artApprovalStatus = CHANGES_REQUESTED`** (if column exists) **or** any **`ArtFile.status = NEEDS_ART`** |
| `QueueDepth` | Last ring depth from **`observability.operatorQueueRecent`** |
| `LastIntakeTime` | ISO time from **`observability.intake.lastAt`**, or blank/null when none |
| `WorkerStatus` | **`Healthy`** \| **`Degraded`** \| **`Recovering`** \| **`Stopped`** \| **`Disabled`** (from worker ring) |
| `ActiveJobs` | Count of orders in **`PRODUCTION_READY`**, **`PRINTING`**, or **`QC`** |
| `TotalOrdersToday` | Orders **`createdAt`** since local midnight |
| `Source` | `prisma` \| `partial` \| `database_unavailable` \| `error` |
| `GeneratedAt` | ISO timestamp for the tile row |
| `Notes` | Optional non-fatal / error detail strings |

Implementation: `email-intake/cheeky-os/services/cheekyOsPowerAppsTiles.service.js`.

---

## 1) Custom connector (OpenAPI import)

1. In [Power Apps](https://make.powerapps.com) → **Data** → **Custom connectors** → **New custom connector** → **Import an OpenAPI file**.
2. Upload **`docs/cheeky-os-power-apps-connector.openapi.yaml`** from this repo.
3. **General**
   - **Scheme**: `HTTPS` for production (or HTTP only on a locked-down dev VLAN — not recommended).
   - **Host**: your App Service hostname or relay (no path, no trailing slash).
4. **Security**
   - For API key parity with Cheeky OS: type **API Key**, Parameter name **`X-Cheeky-Dashboard-Key`**, location **Header**.
   - For Entra JWT: replace with **OAuth 2 + Azure AD**, and configure **Bearer** in Cheeky with `CHEEKY_DASHBOARD_AUTH_MODE=entra` (`cheekyOsDashboardAuth.service.js`).
5. Under **Definition**, confirm three actions: **`GetDashboardData`**, **`GetHealth`**, **`GetQueue`**.
6. **Test** Connect with either:
   - Your dashboard API key (`CHEEKY_DASHBOARD_API_KEY`), or  
   - A test Entra identity if using Bearer.
7. **Create connector**, then **+ New connection** in your environment.

> **Operations without key:** `/health` and `/api/operator/queue` usually work anonymously. **`GetDashboardData`** requires dashboard auth whenever it is enforced in prod.

Rename the connector in formulas below from `CheekyOS_ConnectorName` to whatever you chose (example: **`CheekyOS`**).

---

## 2) App variables / collections (recommended shape)

Keep **one flattened row** for bindings (optional second collection for queue list):

| Name | Type | Purpose |
|------|------|---------|
| `colCheekyTile` | Collection, **1 row** | Tile integers + metadata after each refresh |
| `locLoading` | Boolean (context) | Spinner |
| `locCheekyErr` | Text (context) | Error banner text; blank = OK |
| `locLastOk` | DateTime (context) | Last successful fetch |
| `varCheekyBaseUrl` | Text | e.g. `https://your-app.azurewebsites.net` for **Launch** / deep links |

**Row shape** (what you store in `colCheekyTile`):

```text
DashboardStatus, OrdersOnHold, OrdersWaitingOnArt, Estimates, BlanksNeeded, OrdersNeedingArt,
QueueDepth, LastIntakeTime, WorkerStatus, ActiveJobs, TotalOrdersToday,
TileSource, TileGeneratedAt, Version, CurlHint
```

You can copy scalar fields from `GetDashboardData()` into this single row — see **`fnRefreshCheeky`** below.

---

## 3) Power Fx — single refresh routine (reuse everywhere)

Use the same formula on **`btnRefreshCheeky.OnSelect`** and **`tmrPollCheeky.OnTimerEnd`**. Replace **`CheekyOS`** with your connector name.

**Recommended — `IfError` (broad tenant support):**

```powerfx
Set(locLoading, true);;
Set(locCheekyErr, Blank());;
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
                Version: d.version,
                CurlHint: d.powerAppsTestHint
            })
        );;
        Set(locLastOk, Now())
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
            Version: Blank(),
            CurlHint: Blank()
        })
    );;
    Set(locCheekyErr, "Cheeky OS unreachable, wrong key, or invalid response");;
    Notify(locCheekyErr, NotificationType.Error)
);;
Set(locLoading, false)
```

**Optional — `Try` + `IsSuccess`** (newer Power Fx): if your studio shows **`IsSuccess(TryResult)`** in autocomplete, you can branch on `tr.IsSuccess` and read `tr.Value` instead of `IfError`.

---

## 4) `App.OnStart`

```powerfx
Set(varCheekyBaseUrl, "https://YOUR-HOST");;
IfError(
    ClearCollect(colOpQueue, CheekyOS.GetQueue().jobs),
    ClearCollect(colOpQueue, Table())
);;
/* Identical refresh as §3 (paste full IfError block from §3 below this line). */
```

**OnStart quirks:** Prefer keeping **delayed load off** while testing so `OnStart` runs reliably; after it works you can shorten `OnStart` to only **`Set(varCheekyBaseUrl, …)`** and load from the first **`Screen.OnVisible`** or the timer instead.

---

## 5) Polling **`Timer`** (30–60 s)

Control **`tmrPollCheeky`**:

| Property | Value |
|----------|--------|
| `Duration` | `45000` (45 s — pick 30000–60000) |
| `Repeat` | `true` |
| `AutoStart` | `true` |
| **`OnTimerEnd`** | Paste the **same** refresh formula as **`btnRefreshCheeky.OnSelect`** (`IfError` block from §3). |

---

## 6) Tile label bindings

Assuming **`colCheekyTile`** has exactly one logical row (`First(colCheekyTile)`):

| Tile | Control **`Text`** |
|------|----------------------|
| Orders On Hold | `Text(First(colCheekyTile).OrdersOnHold)` |
| Orders Waiting On Art | `Text(First(colCheekyTile).OrdersWaitingOnArt)` |
| Estimates | `Text(First(colCheekyTile).Estimates)` |
| Blanks Needed | `Text(First(colCheekyTile).BlanksNeeded)` |
| Orders Needing Art | `Text(First(colCheekyTile).OrdersNeedingArt)` |
| (optional) Queue depth | `Text(First(colCheekyTile).QueueDepth)` |
| Last intake | `Text( First(colCheekyTile).LastIntakeTime, DateTimeFormat.ShortDateTimeUTC )` *(or plain `Text` if already formatted)* |
| Worker | `First(colCheekyTile).WorkerStatus` |
| Active jobs | `Text(First(colCheekyTile).ActiveJobs)` |
| Orders today | `Text(First(colCheekyTile).TotalOrdersToday)` |
| Degraded strip | **`Visible`** `First(colCheekyTile).DashboardStatus = "degraded"`, **`Text`** `"Degraded · " & First(colCheekyTile).TileSource` |
| Curl hint (debug) | `First(colCheekyTile).CurlHint` in a monospace label hidden in prod |
| Footer / version | `"v" & First(colCheekyTile).Version` |

Use **`d.summary.headline`** inside the same **`With({ d: … }, …)`** block as your **`ClearCollect`** if you want a one-line status without duplicating fields from **`tiles`**.

---

## 7) UX polish

### Refresh button **`btnRefreshCheeky`**.**`OnSelect`**

Reuse the **`IfError`…** snippet from §3 (full block).

### Loading overlay

Transparent rectangle **`rectLoading`** over tiles:

| Property | Formula |
|---------|---------|
| `Visible` | `locLoading` |
| **`Fill`** | `RGBA(0,0,0,0.15)` |

**`lblLoading`** on top:

- `Visible`: `locLoading`
- `Text`: `"Refreshing…"`

### Error banner **`lblCheekyErr`**

| Property | Formula |
|---------|---------|
| `Visible` | `!IsBlank(locCheekyErr)` |
| `Color` | `Color.Red` |
| `Text` | `locCheekyErr` |

---

## 8) Navigate / deep link buttons

Use **`Launch()`** against your HTTPS host plus the route you already expose.

Examples (adjust paths to match deployment):

```powerfx
// New intake / intake form (whatever you already host)
Launch(varCheekyBaseUrl & "/intake-flow.html")

// Built-in operator HTML dashboard (auth via key / session as you configured)
Launch(varCheekyBaseUrl & "/dashboard")

// Admin flows (needs CHEEKY_ADMIN_API_KEY on requests — normally not called from Canvas; browser session only if proxied)
// Launch(varCheekyBaseUrl & "/admin/...")
```

For **Teams / mobile-safe** links prefer **published** HTTPS endpoints only.

---

## 9) Optional: second connector call for queue drill-in screen

Gallery **`galQueue`**:

- **`Items`**: `colOpQueue` filled from **`ClearCollect(colOpQueue, CheekyOS.GetQueue().jobs)`**  
- **`OnVisible`** or refresh button: rerun that collect after dashboard refresh.

---

## 10) Backend checklist (deployment)

1. **`CHEEKY_DASHBOARD_API_KEY`** set; **`CHEEKY_DASHBOARD_REQUIRE_AUTH=true`** in production.
2. Reverse proxy forwards **`X-Cheeky-Dashboard-Key`** (no strip).
3. Prisma **`Order` / `Task` / `ArtFile` / `Estimate`** migrated — missing columns degrade **`OrdersNeedingArt`** gracefully (fallback to **`ArtFile` only`).
4. CORS only needed if Canvas called Cheeky from **browser** — native Power Apps runtimes proxy through connectors and **don’t rely on browser CORS** to Cheeky.

---

## Local verify (server + `tiles`)

From repo **`email-intake`** (with `.env` loaded like `npm start`):

```bash
npm run build
npm start
# other terminal:
npm run test:dashboard
```

**Local dev:** If Dataverse intake columns are not mapped yet, set **`CHEEKY_OS_BOOT_INTAKE_SELFTEST=false`** in `.env` to skip the optional boot HTTP probe (errors are logged only and do not stop the server).

`test:dashboard` prints pretty JSON and checks that **`tiles`** includes **`OrdersOnHold`**, **`BlanksNeeded`**, **`WorkerStatus`**, **`ActiveJobs`**, **`TotalOrdersToday`**, etc.

Optional: `CHEEKY_DASHBOARD_TEST_URL=http://127.0.0.1:3010` if not using port **3000**.

---

## File reference

- OpenAPI: `docs/cheeky-os-power-apps-connector.openapi.yaml`
- Tiles service: `email-intake/cheeky-os/services/cheekyOsPowerAppsTiles.service.js`
- Route: `email-intake/cheeky-os/routes/cheekyOsV4.route.js` → **`GET /api/cheeky-os/dashboard-data`**
- Smoke script: `email-intake/scripts/test-dashboard-data.js` → **`npm run test:dashboard`**
