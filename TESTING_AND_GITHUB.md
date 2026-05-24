# Australian Trade Finder Strategy

## Purpose

The Australian Trade Finder is designed for ASX swing-trading research. The system is built to find high-quality trade candidates only when the market, sector, stock trend, liquidity, volume, and risk/reward all support the trade.

This is not financial advice. The system must be tested before real money is used.

## Australian market rules

The ASX needs its own rules because it is not the same as the US market. The Australian market has lower liquidity in many names, heavy exposure to banks and resources, commodity sensitivity, and a different opening process.

ASX announced that from 23 June 2025, the Australian market would move to a single open with all stocks opening at the same time. That means intraday strategies should treat pre-change and post-change data separately.

ASIC reported in Report 828 that in FY 2023-24, 133,674 Australian retail clients lost money trading CFDs, with net losses exceeding $458 million, including $73 million in fees. Because of this, this system should be built first around ASX shares and ETFs, not leveraged CFDs.

## Core system logic

A trade candidate must pass five filters:

1. Market condition filter
2. Sector strength filter
3. Stock trend and relative strength filter
4. Liquidity and spread filter
5. Risk/reward and stop-loss filter

A good-looking chart is not enough.

## Market condition filter

The system checks:

- ASX 200 trend
- ASX 300 breadth
- Stocks above 50-day moving average
- New highs versus new lows
- Sector rotation
- Overnight US market lead
- Commodity support where relevant
- RBA and CPI risk windows

If the market score falls below the kill-switch level, no new long trades should be taken.

## Sector strength filter

The Australian version must check sector strength before stock selection. Priority sectors include:

- Financials
- Materials
- Energy
- Healthcare
- Technology
- REITs
- Gold
- Lithium
- Consumer discretionary

A stock gets extra weight only when its sector is also strong.

## Main setups

### 1. ASX Momentum Breakout

Conditions:

- Stock above 50-day and 200-day moving averages
- 50-day moving average rising
- Relative strength positive versus ASX 200
- Clean base of at least 3 to 8 weeks
- Breakout above resistance
- Volume at least 1.5x average volume
- Reward/risk at least 2:1

Entry:

- Close above resistance, or next-day confirmation

Stop:

- Below breakout level, below swing low, or 1.5 ATR below entry

Exit:

- Partial at 2R if extended
- Trail remainder with structure, ATR, 10-day low, or 20-day moving average

### 2. Pullback In Uptrend

Conditions:

- Stock is in a confirmed uptrend
- Pullback to 20-day or 50-day moving average
- Pullback volume dries up
- Price holds support
- Sector still strong

Entry:

- Break above pullback high

Stop:

- Below pullback low

Exit:

- Trail while trend remains valid

### 3. GMMA Compression Breakout

Conditions:

- Short-term moving averages compress
- Long-term moving averages flatten or rise
- Price closes above compression zone
- Volume expands
- Relative strength improves

Entry:

- Breakout from compression

Stop:

- Below compression low

Exit:

- Exit if price loses support and short-term averages roll back under long-term group

### 4. Announcement Breakout

Conditions:

- Announcement is material
- Volume expands strongly
- Price holds above breakout or gap area
- Liquidity is acceptable

Entry:

- Prefer confirmation or pullback rather than buying the first spike

Stop:

- Below announcement day low or breakout level

### 5. ASX ETF Trend Trade

Used when individual stocks are messy but broad market trend is strong.

Possible instruments:

- A200
- IOZ
- STW
- VAS

## Scoring model

Final score weights:

- Market condition: 15%
- Sector strength: 15%
- Stock trend: 20%
- Relative strength: 15%
- Volume confirmation: 10%
- Setup quality: 15%
- Risk/reward: 10%

Grades:

- A+: 90 to 100
- A: 85 to 89
- Watch: 70 to 84
- Reject: under 70 or any hard-rule fail

## Hard no-trade rules

Reject the trade if:

- No clear stop exists
- Reward/risk is below 2:1
- Average daily value is too low
- Spread is too wide
- Market score is below kill switch
- Stock is too extended
- Setup depends on social media hype
- Position size breaks risk rules
- Portfolio is already too exposed to the same sector

## Risk rules

Start with paper trading.

When live testing begins:

- Risk 0.25% to 0.5% per trade
- Never exceed 1% without strong evidence
- Total open portfolio risk should stay below 4% to 6%
- Correlated sector positions must be capped

Position size formula:

Position size = account dollar risk / risk per share

## Backtesting rules

The system needs:

- At least 10 years of daily ASX data if possible
- Delisted stock data where possible
- Brokerage and slippage
- Separate testing by setup type
- Separate testing by sector and market regime
- Walk-forward testing

Minimum preferred pass standards:

- Profit factor above 1.5
- Positive expectancy after costs
- Acceptable max drawdown
- At least 100 trades per setup where possible
- No single stock or sector responsible for most profits

## Paper trading rules

Before live money:

- 50 paper trades or 3 months, whichever takes longer
- Every trade logged with chart, score, reason, stop, target, result and mistake review

## Kill switch

Stop new trades if:

- Live drawdown reaches 5% during test stage
- Five losses in a row occur in weak market conditions
- Market score drops below kill switch level
- Rules are broken repeatedly
- Live results diverge badly from backtest

## Sources to keep attached to the system

- ASX market structure: https://www.asx.com.au/blog/listed-at-asx/changes-to-equity-market-structure
- ASIC Report 828 on CFDs: https://download.asic.gov.au/media/tq0he35c/rep828-published-20-january-2026.pdf
- The Chartist: https://www.thechartist.com.au/
- GMMA reference: https://www.investopedia.com/terms/g/guppy-multiple-moving-average.asp
