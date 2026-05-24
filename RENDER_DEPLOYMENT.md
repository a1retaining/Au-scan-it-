# Architecture

## Front end

The front end is built as a Vite React app. It is designed to be familiar to users of the US Traders Success Formula version:

- dark command centre
- signal list
- stock click-through chart
- heatmap
- backtest panels
- paper account panel
- plain-English explanations

## Backend

Core modules:

- `data_provider.py`: local CSV data access
- `indicators.py`: SMA, EMA, ATR, RSI and core derived fields
- `scoring.py`: ASX scoring engine
- `risk.py`: position sizing, risk caps and kill switch
- `paper.py`: paper account simulator
- `backtest.py`: simple demonstration backtest
- `api.py`: FastAPI endpoints

## Real production upgrade path

1. Replace CSV provider with a real ASX data provider.
2. Store historical data in SQLite, DuckDB or Postgres.
3. Add delisted symbols and corporate actions.
4. Add ASX announcements and event-risk filters.
5. Upgrade charts from demo data to API-driven OHLCV.
6. Add authentication only if multiple users will use it.
