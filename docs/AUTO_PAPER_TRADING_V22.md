# Auto Paper Trading v22

The paper account is now designed to act automatically from the scanner rules. It is still paper only and has no broker connection.

## What it does

On every scan cycle:

1. Loads the newest scanner signals.
2. Checks open paper positions for stop or target hits.
3. Closes paper positions automatically when stop or target is hit by the latest scan price.
4. Enters new paper trades only when:
   - the ASX market clock is open,
   - auto paper trading is enabled,
   - the signal is `READY` or `ARMED`,
   - score is at least the paper threshold,
   - risk/reward is at least 2R,
   - stop is valid,
   - liquidity and spread checks pass,
   - there is no existing paper position in that ticker,
   - the $5,000 paper account has enough cash and risk capacity.

## Environment settings

```text
ASX_AUTO_PAPER_ENABLED=true
ASX_AUTO_PAPER_MAX_ENTRIES_PER_SCAN=2
ASX_SCAN_INTERVAL_SECONDS=60
ASX_DATA_PROVIDER=yfinance
ASX_HISTORY_PERIOD=10y
```

## Endpoints

```text
GET  /paper/auto
POST /paper/auto/run
GET  /paper
GET  /paper/trades
POST /paper/reset
```

## Important

The auto trader is intentionally paper only. Broker execution stays locked until the system has completed historical testing, forward testing, paper testing, audit review and human approval.
