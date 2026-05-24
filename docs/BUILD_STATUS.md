# Build Status and Real Money Readiness

The old dashboard section called **Still Missing Before Real Money** has been replaced with a clearer status board.

Each item is now marked as one of:

- **BUILT**: implemented in the repo or frontend prototype.
- **PART BUILT**: framework exists but needs deeper connection, persistence, or real data.
- **PLANNED**: not implemented yet, but the architecture allows it.
- **NEEDS DATA / NEEDS PROVIDER**: cannot be completed until a real ASX data provider or historical dataset is chosen.
- **LOCKED**: intentionally blocked until backtesting and paper trading prove the system.

## Current key status

| Area | Status | Notes |
|---|---|---|
| Paper account | BUILT | Default starting cash is $5,000. |
| Paper trade journal | BUILT | Tracks entries, exits, P/L, R multiple and exit reason. |
| Brokerage/slippage cost model | BUILT | Configurable and included in paper/backtest logic. |
| Sound and voice alerts | BUILT | Frontend includes browser audio unlock, tone alerts and speech readouts. |
| Clickable ticker chart review | BUILT | Clicking a ticker opens chart, entry, stop, target, reasons and risks. |
| Plain-English explanation engine | BUILT | Explains signal reason and risk. |
| Real ASX live data | NEEDS PROVIDER | Requires selecting and integrating a data vendor. |
| 10+ years historical data | NEEDS DATA | Required before serious backtest confidence. |
| Delisted stock database | NEEDS DATA | Required to avoid survivorship bias. |
| ASX announcements feed | PLANNED | Needed for price-sensitive announcement filtering. |
| Broker connection | LOCKED | Should stay disabled until the system passes paper testing. |

## Why some items cannot be fully built yet

Some features depend on external data that cannot be invented inside the repo. For example, full ASX history, delisted companies, live bid/ask spreads, ASX announcements and broker execution all require third-party data or API providers. The repo now has the structure to plug those in, but the user must choose the provider before the connectors can be finalised.
