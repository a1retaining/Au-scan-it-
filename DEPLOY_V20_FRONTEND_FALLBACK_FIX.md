# Render deployment

## Recommended deployment

Deploy two Render services from the same GitHub repo:

1. **Backend API** as a Python Web Service.
2. **Frontend** as a Node Web Service.

The frontend uses `server.mjs`, a small Node static server. This is more reliable on Render Web Services than `vite preview` because it binds directly to Render's `$PORT`.

## Frontend settings

Use these settings if creating the frontend manually:

```text
Runtime: Node
Root Directory: leave blank
Build Command: npm run build
Start Command: npm start
Health Check Path: /health
```

Do **not** use `vite preview` directly as the Render start command. Use `npm start`.

## Backend settings

```text
Runtime: Python
Build Command: pip install -r requirements.txt && pip install -e .
Start Command: uvicorn asx_trade_finder.api:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

## Frontend environment variables

Set:

```text
VITE_API_BASE_URL=https://your-api-service.onrender.com
VITE_AUTO_REFRESH_MS=60000
```

## Free instance warning

Render Free services can spin down. Keepalive pings help, but the only proper never-sleep setup is a paid instance.

## Common errors fixed

### `vite: not found`

Cause: Render started the app without frontend dependencies installed.

Fix: Use root `npm run build` and root `npm start`. The root build installs frontend dependencies using `npm --prefix frontend ci`.

### `No open ports detected`

Cause: the start command did not bind a server to `$PORT`.

Fix: root `npm start` runs `node server.mjs`, which listens on `0.0.0.0:$PORT` and serves `frontend/dist`.


## V18 visual verification
After deployment, the frontend must show `AU-ASX-INSTITUTIONAL-DESK-V24` in the top-left build tag. The `/health` endpoint must return `build_id: AU-ASX-INSTITUTIONAL-DESK-V24`. If it does not, Render is serving an old build, wrong branch, or wrong service.
