# Real Data, 10-Year History, Market Clock and Alerts

## Real delayed ASX data

The app now has a free delayed real-data path using Yahoo Finance through `yfinance`.

Set this on the API service:

```bash
ASX_DATA_PROVIDER=yfinance
ASX_HISTORY_PERIOD=10y
```

ASX symbols are requested as `.AX` symbols, for example `CBA.AX`, `BHP.AX`, `WES.AX`.

This is suitable for development, paper testing and delayed scanning. It is not a licensed institutional real-time ASX market data feed.

## 10-year historical scanning

The scanner can request 10 years of daily price history:

```bash
python -m asx_trade_finder.scanner --provider yfinance --period 10y
```

The API also uses `ASX_HISTORY_PERIOD=10y` when the provider is set to `yfinance`.

## Market clock

The API exposes:

```text
GET /market-clock
```

It returns the Australia/Sydney ASX session state, current local time, next open, next close, and countdown. The frontend shows whether the market is open or closed and blocks the user from treating closed-market paper entries as live signals.

## No fake paper trades

The frontend no longer shows fake wins or fake open profit. A fresh paper account starts at `$5,000` and shows no trades until the user sends a signal to the paper account.

## Sound and voice

Browsers block audio until the user interacts with the page. The frontend now shows an `Enable sound & voice` button near the top. The user must click it once before sounds or voice readouts will work.

The frontend supports:

- entry tone and voice
- exit review tone and voice
- stop-hit tone and voice
- target-hit tone and voice
- read selected setup

Check browser tab mute, system volume, and site permissions if there is no sound.

## Still not solved without paid/curated data

These cannot be honestly marked complete without external data:

- delisted ASX stock database
- official ASX announcements feed
- live bid/ask spread
- institutional real-time data
- full corporate-action-adjusted history

The code has hooks for these, but the data source has to be chosen.
