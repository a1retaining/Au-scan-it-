# V17 Frontend Rebuild

This version intentionally stops trying to look like the US scanner.

The frontend has been rebuilt as an ASX hedge-fund trade desk:

- build ID visible in the header: `ASX-HEDGE-DESK-V17`
- three-panel institutional layout
- left priority queue
- centre chart and signal blotter
- right trade plan and sector matrix
- bottom paper execution book and production readiness
- no fake paper profits
- no test sound button section
- sound and voice arm on first user click
- market closed stays review-only, but still shows candidates
- $5,000 paper account remains the default

If Render still shows the old green US-style scanner after deploying this version, the deployment is not using the updated files or the browser/build cache is stale.

Render frontend settings:

```text
Build Command: npm run build
Start Command: npm start
Health Check Path: /health
```

Backend remains:

```text
Build Command: pip install -r requirements.txt && pip install -e .
Start Command: uvicorn asx_trade_finder.api:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```
