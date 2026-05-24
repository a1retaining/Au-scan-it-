# Testing and GitHub Readiness

This repo is structured so it can be pushed to GitHub and checked by CI.

## Local verification

Run from the repo root:

```bash
make install
make test
make scan
make backtest
cd frontend
npm ci
npm run build
```

Current verified result:

- Python unit/API tests: `12 passed`
- Scanner sample run: passes and writes CSV/JSON outputs
- Backtest sample run: passes and writes CSV output
- Frontend production build: passes with Vite

## GitHub Actions

The repo includes `.github/workflows/ci.yml` with two jobs:

1. Backend job
   - installs Python dependencies
   - installs the package in editable mode
   - runs unit/API tests
   - runs sample scanner
   - runs sample backtest

2. Frontend job
   - installs Node dependencies using `npm ci`
   - builds the Vite frontend

## Real-money safety status

The app is paper-testing only. Broker execution is intentionally locked. Real-money integration should not be added until:

- ASX data provider is selected and connected
- historical data quality is verified
- delisted stock data is included
- walk-forward testing passes
- paper trading has at least 50 trades or 3 months of records
- costs, slippage, liquidity and spread results are reviewed
