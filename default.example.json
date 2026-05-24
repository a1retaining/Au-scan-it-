# Chart legend, priority queue and shared scanner state - V23

## Chart lines

The candlestick chart uses these markings:

- Green/red candles: price movement for each bar. The body shows open to close. The wick shows high to low.
- Yellow line: 20-period moving average. This is a trend reference, not an entry by itself.
- Dashed blue line: planned entry level.
- Dashed red line: stop/invalidation level.
- Dashed green line: first target level.
- Lower bars: volume.

## Priority queue

The side priority queue now shows:

- ticker
- setup type
- last/current price supplied by the scan
- entry area / buy zone
- score
- status

This lets the user see what the trade is currently at and where the system wants entry without opening each plan first.

## Shared scanner updates

If the frontend is connected to the hosted backend API, scan updates are shared through the Render backend. Everyone who opens the site sees the same latest signal book from the backend cache.

Local per-browser state includes:

- selected ticker
- sound armed state
- muted/unmuted browser state
- chart focus

Paper trades are currently shared by the backend paper account file unless user accounts are added. For public use, user accounts or separate paper ledgers should be added before multiple people use it seriously.

If `API_PROXY_TARGET` is not configured, the frontend uses local fallback review data. That fallback is the same code for everyone but is not live backend scanning.
