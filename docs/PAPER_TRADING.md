# Paper Trading

The ASX Trade Finder paper account starts at **$5,000** by default. This can be changed later, but the small starting balance is deliberate because it forces conservative position sizing and shows whether the system can work under realistic account constraints.

## What gets tracked

Every paper trade should keep:

- trade ID
- ticker
- setup type
- signal score
- entry date and time
- entry price
- stop loss
- target
- quantity
- brokerage
- slippage
- exit date and time
- exit price
- exit reason
- gross P/L
- net P/L
- R-multiple
- result: WIN, LOSS, BREAKEVEN or OPEN

## Alerts

When a paper trade is entered, the backend returns a `TRADE_ENTERED` alert payload with `auto_close_seconds: 60`.

The frontend should show a popup/modal for one minute unless the user closes it manually.

## Safety

This remains paper-only. Broker integration should stay disabled until the system has passed backtesting, walk-forward testing, and paper trading.
