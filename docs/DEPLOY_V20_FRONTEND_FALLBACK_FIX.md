# V20 Render Frontend/API Fallback Fix

## What this fixes

The frontend was trying to fetch `/signals` from the frontend service. If `API_PROXY_TARGET` was not set, the Node static server returned `index.html`, so the browser tried to parse HTML as JSON and showed:

`Unexpected token '<', '<!doctype ... is not valid JSON`

V20 fixes this by adding safe local JSON fallback responses for:

- `/signals`
- `/market-clock`
- `/paper`
- `/prices/{ticker}`
- `/paper/enter` and `/paper/exit` return a clear locked error until a backend is connected

This keeps the screen usable and stops the JSON error.

## Important

The local fallback is **review-only**. It is not live market data. To make it real, set the frontend environment variable:

```text
API_PROXY_TARGET=https://YOUR-BACKEND-API.onrender.com
```

Then redeploy the frontend with:

```text
Manual Deploy -> Clear build cache & deploy
```

## Confirm deploy

Open:

```text
https://YOUR-FRONTEND.onrender.com/health
```

Expected:

```json
{ "build_id": "AU-ASX-INSTITUTIONAL-DESK-V20" }
```

Open:

```text
https://YOUR-FRONTEND.onrender.com/signals
```

If backend is not connected, it should return JSON with:

```json
{ "mode": "local_frontend_fallback" }
```

It should never return HTML for `/signals`.
