# Keepalive and Auto Refresh

## Important limitation

Render free web services can spin down when inactive and can also be suspended when monthly free instance hours are exhausted. The only reliable way to make Render never sleep is to use a paid Render instance.

This repo now includes optional keep-warm support, but it should be treated as monitoring/demo support, not a guaranteed production hosting strategy.

## Backend endpoints

- `GET /health` returns API status and UTC time.
- `GET /keepalive` is a lightweight endpoint for uptime monitors.
- `GET /signals` returns the current scanned signal payload.
- `POST /refresh` forces a scan refresh using the configured data provider.

## GitHub Actions keepalive

The workflow `.github/workflows/keepalive.yml` can ping deployed URLs every 10 minutes.

Add this GitHub repository secret:

```text
KEEPALIVE_URLS=https://your-api.onrender.com/keepalive,https://your-frontend.onrender.com
```

GitHub scheduled workflows are not a hard real-time service, so do not rely on this for live trading execution.

## Render option

For the cleanest setup, upgrade the API to a paid Render instance so it does not sleep.

## Frontend auto refresh

The frontend polls the backend every 60 seconds by default. Set this in `frontend/.env` or Render environment variables:

```text
VITE_API_BASE_URL=https://your-api.onrender.com
VITE_AUTO_REFRESH_MS=60000
```

The dashboard displays the last refresh time in the header.

## Stock data warning

Auto refresh only refreshes whatever provider is connected. In the current repo, the default provider uses sample CSV data. Real ASX auto-refresh requires a real ASX data provider.
