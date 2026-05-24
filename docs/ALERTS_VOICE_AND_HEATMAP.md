# Alerts, Voice Reading, and Expanded Heatmap

## Alert behaviour

The frontend is designed to show a trade-entry alert whenever a paper trade is entered.

Required alert fields:

- `event_type`: `TRADE_ENTERED`, `TRADE_EXITED`, `STOP_HIT`, `TARGET_HIT`, `SIGNAL_BLOCKED`
- `ticker`
- `entry`
- `stop`
- `target`
- `message`
- `auto_close_seconds`: default `60`
- `created_at`

The popup should stay visible for 60 seconds or until the user closes it.

## Sound behaviour

Sound alerts should be optional and user-controlled.

Recommended sounds:

- Entry: short positive beep
- Exit target hit: stronger positive tone
- Stop hit: lower warning tone
- Blocked trade: soft warning tone
- Kill switch: urgent warning tone

Sound should be off/on from the dashboard settings and should never override the user's browser/device settings.

## Voice reading behaviour

Voice reading should use the browser SpeechSynthesis API for the frontend.

The assistant should read:

- ticker
- trade status
- entry level
- stop level
- target level
- reason for entry
- what invalidates the trade
- when to exit

Example:

> CBA paper trade entered. Entry is $123.20. Stop is $119.80. Target is $132.70. Exit if the stop is hit, the target is hit, or the setup becomes invalid.

## Exit callouts

The system should read exit instructions when required:

- `STOP_HIT`: Exit now. The stop has been hit.
- `TARGET_HIT`: Target reached. Close or trail according to the trade plan.
- `SIGNAL_INVALIDATED`: Exit because the original setup is no longer valid.
- `MARKET_KILL_SWITCH`: Do not enter new trades. Review open positions.

## Expanded heatmap

The heatmap should not only show sectors. It should show:

1. Sector strength
2. Market breadth
3. Commodity confirmation
4. Setup flow
5. Leaders inside each sector
6. Warning notes
7. Blocked/avoid areas

Minimum heatmap groups:

- Market: ASX 200, ASX 300, Small Ords, breadth
- Commodities: gold, iron ore, oil, lithium
- Sectors: banks, materials, gold, energy, healthcare, lithium, REITs, tech
- Signal Flow: breakouts, pullbacks, volume spikes, blocked names

## Paper account starting value

The paper account default is $5,000 and can be changed later in config.
