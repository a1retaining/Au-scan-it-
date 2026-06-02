# TradingMint PRO ASX - v6 US-look, ASX-real

This is the Australia-only ASX scanner rebuilt to visually match the US TradingMint PRO dashboard style at `us-scan.onrender.com`, while keeping the ASX backend real-data only.

## What changed in v6

- Restored the TradingMint PRO command-centre style: left navigation, quick actions, session strip, metric cards, ranked scanner, right-side decision stream, market snapshot, chart panel, sector rotation, paper account, and system health.
- Kept ASX-only symbols and AUD display.
- Kept public Yahoo `.AX` chart data only. No fake quotes, no fake option chains, no fake broker fills.
- Ranked scanner table now uses a quality gate derived from backend score, risk/reward, liquidity, decision, and warnings.
- Added clearer A-grade count, system confidence, sector leader, market snapshot, and chart overlays.
- Options route still refuses to fabricate ASX options data.

## Run locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:10000
```

## Test commands

```bash
npm run check
node server.js
curl http://localhost:10000/api/health
curl "http://localhost:10000/api/options?symbol=CBA"
curl "http://localhost:10000/api/scan?symbols=CBA,BHP,CSL"
```

The scan route requires outbound access to Yahoo Finance's public chart endpoint. If your host blocks outbound requests or Yahoo is unavailable, the app returns a real error rather than fake data.

## Data reality

This is not a licensed live ASX terminal. Public/free ASX chart data is normally delayed. The app labels the feed as public data and does not claim true exchange real-time data.

## Live money

Live broker execution stays locked. This is scanner, research, backtest and paper-trading only until proper broker, licensed data, slippage, liquidity, walk-forward testing, and risk controls are completed.
