# Upload-friendly GitHub version

This package intentionally does **not** include `node_modules`, `frontend/node_modules`, `frontend/dist`, Python cache files, or generated output files.

Why: GitHub web upload can fail or become painful when a folder has thousands of dependency files. Dependencies should be installed by Render/GitHub Actions from `package-lock.json` and `requirements.txt`.

## Upload to GitHub

Upload the contents of this folder, not the dependency folders.

## Render frontend

Build Command:

```bash
npm run build
```

Start Command:

```bash
npm start
```

Health Check Path:

```text
/health
```

## Render backend

Build Command:

```bash
pip install -r requirements.txt && pip install -e .
```

Start Command:

```bash
uvicorn asx_trade_finder.api:app --host 0.0.0.0 --port $PORT
```
