# Outreach close — local test (default port 3000)

Use straight double quotes (ASCII). Replace `YOUR_ACTUAL_KEY` with the value of `API_KEY` from your `email-intake/.env`.

```bash
curl -X POST "http://localhost:3000/outreach/close?apikey=YOUR_ACTUAL_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```

PowerShell (avoids line-continuation issues):

```powershell
curl.exe -X POST "http://localhost:3000/outreach/close?apikey=YOUR_ACTUAL_KEY" -H "Content-Type: application/json" -d "{}"
```

Note: the handler is registered as **POST** `/outreach/close`. **GET** returns 404 after auth, not the pipeline body.
