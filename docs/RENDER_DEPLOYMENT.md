# Render Deployment

## Recommended setup

Create two Render services:

1. **Backend API** as a Python Web Service
2. **Frontend** as a Static Site

## Backend API service

Use these settings:

```text
Root Directory: leave blank
Build Command: pip install -r requirements.txt && pip install -e .
Start Command: uvicorn asx_trade_finder.api:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

## Frontend static site

Use these settings:

```text
Root Directory: frontend
Build Command: npm ci && npm run build
Publish Directory: dist
```

Add this environment variable after your backend URL is known:

```text
VITE_API_BASE_URL=https://YOUR-BACKEND-SERVICE.onrender.com
```

## If you deploy the frontend as a Web Service by mistake

The root `package.json` now supports this too.

Use:

```text
Build Command: npm run build
Start Command: npm start
```

The start script installs frontend dependencies if missing, builds `dist` if missing, and then runs Vite preview on Render's `$PORT`.

## Previous error fixed

If Render shows this:

```text
sh: 1: vite: not found
```

It means the frontend dependencies were not installed before `npm start`. This repo now fixes that by making the root `start` command run `npm ci` inside `frontend` when `node_modules` is missing.
