# Render deployment

The project is a monorepo:

- frontend app: `frontend/`
- Python API: `src/asx_trade_finder/`

## Why the previous Render build failed

Render tried to run `npm install` from the repository root and looked for:

```text
/opt/render/project/src/package.json
```

The old repo only had `frontend/package.json`, so Render failed with:

```text
ENOENT: no such file or directory, open '/opt/render/project/src/package.json'
```

This version fixes that by adding a root `package.json` that forwards build/start commands to the frontend.

## Easiest frontend deploy

Create a Render Static Site and use:

```text
Root Directory: frontend
Build Command: npm ci && npm run build
Publish Directory: dist
```

## Easiest API deploy

Create a Render Web Service and use:

```text
Runtime: Python
Build Command: pip install -r requirements.txt && pip install -e .
Start Command: uvicorn asx_trade_finder.api:app --host 0.0.0.0 --port $PORT
```

## Blueprint deploy

A `render.yaml` file is included at the repo root. Render can use it to create both services.

## Root deploy fallback

If Render still builds from the repo root, the root `package.json` supports:

```bash
npm install
npm run build
npm start
```

That will build and serve the frontend from `frontend/`.
