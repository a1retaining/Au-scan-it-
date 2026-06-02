# TradingMint ASX Real - v5 old look restored

Australia-only ASX scanner built from your US backend idea, but cleaned so it does not fake unavailable data.

## What it does

- Scans ASX shares only.
- Uses Yahoo Finance public chart data with `.AX` symbols, for example `CBA.AX`.
- Normalises `CBA` to `CBA.AX` automatically.
- Uses AUD, Sydney market hours, and ASX sector lists.
- Provides swing scan, day scan, discovery scan, historical backtest, and paper-trade tracking.
- Refuses to fabricate ASX option chain data.

## Important data reality

This is not a licensed live ASX data terminal. ASX delayed data is normally delayed for free/public users. ASX says delayed data is available with 20-minute delay for cash equities and 10-minute delay for derivatives. This app clearly labels public data and does not claim true live exchange data.

## Install

```bash
npm install
npm start
```

Open:

```txt
http://localhost:10000
```

## Main API routes

```txt
GET  /api/health
GET  /api/scan?symbols=CBA,BHP,CSL
GET  /api/scan?sector=banks
GET  /api/discover?scanLimit=80&limit=30
GET  /api/day-scan?symbols=CBA,BHP,CSL
GET  /api/bars?symbol=CBA&range=1y&interval=1d
GET  /api/backtest?symbols=CBA,BHP,CSL&years=5&account=5000&risk=50
GET  /api/options?symbol=CBA
POST /api/paper/open
POST /api/paper/close
GET  /api/paper/trades
GET  /api/paper/stats
GET  /api/sectors
GET  /api/universe
```

## Options route

`/api/options` intentionally returns `not_available_from_current_public_data_source` unless you connect a real ASX options-chain provider.

That is by design. It avoids fake delta, fake IV, fake open interest, and fake bid/ask data.

## Paper trade example

```bash
curl -X POST http://localhost:10000/api/paper/open \
  -H "Content-Type: application/json" \
  -d '{"symbol":"CBA","side":"long","entry":180,"shares":5,"stop":174,"target":192,"setup":"ASX Pullback"}'
```

## What to connect later for real options

To add real ASX options, connect one of:

- licensed ASX derivatives data
- broker API with ASX exchange-traded options chain
- verified options data vendor

Do not add an options picker until the chain includes real bid, ask, expiry, strike, volume, open interest, and ideally Greeks or enough fields to compute them.


## v2 scoring fix

This version fixes the issue where the chart could change for days or weeks while the score stayed nearly the same.

The original score was too slow because it heavily rewarded long-term conditions such as price above EMA20, EMA50, EMA200, broad RSI bands, and liquidity. Those can remain unchanged for weeks.

The v2 score now includes more responsive inputs:

- 5 day momentum
- 10 day momentum
- 20 day momentum
- position inside the 20 day high-low range
- latest candle direction
- volume confirmation
- short-term EMA acceleration
- distance from EMA20 warning
- scoreParts breakdown so you can see exactly why the score changed

The app still uses real public ASX chart data only. It does not fabricate live prices or ASX options chains.


## v4 restored command-centre UI

This build restores the dark command-centre dashboard style from the uploaded old project notes, while keeping the ASX real-data backend and responsive score fixes. It does not use fake options-chain data.
