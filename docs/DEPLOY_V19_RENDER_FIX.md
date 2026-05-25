# Render deployment fix for v19

The live `/health` page must return this build id:

```json
"build_id": "AU-ASX-INSTITUTIONAL-DESK-V26"
```

If it does not, Render is still running old code.

## Render frontend service settings

Use these exactly for the frontend web service:

```text
Root Directory: leave blank
Build Command: npm run build
Start Command: npm start
Health Check Path: /health
```

Do not set Root Directory to `frontend` for this repo version. The root `server.mjs` serves the built frontend and exposes `/health`.

## Required frontend environment variables

```text
API_PROXY_TARGET=https://YOUR-BACKEND-SERVICE.onrender.com
VITE_AUTO_REFRESH_MS=60000
VITE_DEMO_MODE=false
```

## Render backend service settings

```text
Build Command: pip install -r requirements.txt && pip install -e .
Start Command: uvicorn asx_trade_finder.api:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Environment:

```text
ASX_DATA_PROVIDER=yfinance
ASX_HISTORY_PERIOD=10y
ASX_WATCHLIST=data/watchlists/asx_core.csv
ASX_SCAN_INTERVAL_SECONDS=60
```

## Required deploy process

1. Push the v19 files to GitHub.
2. Open Render frontend service.
3. Go to Settings and confirm the commands above.
4. Click `Manual Deploy`.
5. Choose `Clear build cache & deploy`.
6. Open `https://YOUR-FRONTEND.onrender.com/health`.
7. Confirm it shows `AU-ASX-INSTITUTIONAL-DESK-V26`.

If `/health` does not show v19, Render is not using the new GitHub commit, branch, or root directory.
