# Production Queue Dashboard — Cheeky Tees

## What This Is

A single self-contained HTML file that shows the live production queue. No frameworks, no build step, no dependencies. Just open it in a browser.

## How to Open

### On Desktop

1. Navigate to `email-intake/dashboard/`
2. Double-click `index.html`
3. Or open Chrome/Edge and go to: `file:///C:/Users/PatCo/source/repos/CheekyAPI/email-intake/dashboard/index.html`

### On iPhone Safari

1. Make sure your computer and phone are on the same network
2. Find your computer's local IP (run `ipconfig` in PowerShell)
3. On iPhone Safari, go to: `http://YOUR_IP:3000/dashboard`
   *(requires serving the file — see below)*

**Quick serve option:** Copy `index.html` to the webhook server's public folder, or open it directly via file share.

## How to Change the API Base URL

Open `index.html` in any text editor. Near the top of the `<script>` section, change:

```javascript
var BASE_URL = "http://localhost:3000";
```

To your server's address:

```javascript
var BASE_URL = "http://192.168.1.100:3000";
```

## How to Add to iPhone Home Screen

1. Open the dashboard URL in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Name it: **Cheeky Queue**
5. Tap **Add**

It will appear as an app icon on your home screen and open in full-screen mode.

## Features

- **Live clock** — updates every second
- **System status** — pings /health every 30 seconds (green = online, red = offline)
- **Summary cards** — Active orders, due today, overdue, completed this week
- **Stage breakdown bar** — visual count per stage
- **Sortable table** — click any column header to sort
- **Search/filter** — type to filter by any field
- **Mark Shipped** — enter an Order ID to update stage via API
- **Export CSV** — download current queue as a spreadsheet
- **Auto-refresh** — data reloads every 60 seconds
- **Mobile responsive** — works on iPhone Safari

## Demo Data

Until the `GET /orders` endpoint is built, the dashboard shows realistic demo data so you can test all features (sorting, filtering, export, stage colors, overdue highlighting). When the endpoint is available, real data flows in automatically.
