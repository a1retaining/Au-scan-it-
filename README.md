# Traders Success Formula: ASX

A GitHub-ready Australian trading system project with:

- ASX signal scanner
- scoring engine
- risk manager
- paper trading account
- simple backtest runner
- FastAPI backend
- React/Vite frontend dashboard
- sample ASX-style data
- tests

This is a research and paper-trading project. It is **not financial advice** and it must not be connected to real-money execution until the system has passed historical testing, walk-forward testing, paper trading, slippage modelling and risk review.

## What the user sees

The front end is a dark command-centre dashboard:

- market score
- best sector
- A-grade setups
- paper account equity
- clickable stock signals
- chart panel with entry, stop and target
- plain-English signal explanations
- heatmap
- backtest charts
- paper account section
- live-money locked status

## Install backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
pytest
```

## Run scanner

```bash
python -m asx_trade_finder.scanner \
  --input data/sample/sample_watchlist.csv \
  --prices data/sample/prices \
  --output outputs/scanner_output.csv
```

## Run backtest

```bash
python -m asx_trade_finder.backtest \
  --input data/sample/sample_watchlist.csv \
  --prices data/sample/prices \
  --output outputs/backtest_results.csv
```

## Run API

```bash
uvicorn asx_trade_finder.api:app --reload
```

API endpoints:

- `GET /health`
- `GET /signals`
- `GET /paper`
- `POST /paper/reset`

## Run frontend

```bash
cd frontend
npm install
npm run dev
```

## Paper account

The paper account is deliberately separate from broker execution. It simulates:

- cash
- positions
- market orders
- fills
- brokerage
- slippage
- stops and targets stored with positions
- equity
- open risk
- kill-switch checks
- save/load to JSON

See `docs/PAPER_TRADING.md`.

## Real-money gate

Real trading should stay locked until all of this exists and passes:

1. Real ASX data feed
2. At least 10 years historical data
3. Delisted stock handling
4. Brokerage and slippage model
5. Spread and liquidity model
6. Walk-forward testing
7. Paper trading with at least 50 trades or 3 months, whichever is longer
8. Risk kill switch
9. Manual review of all high-risk edge cases

## Repo structure

```text
frontend/                  React dashboard
src/asx_trade_finder/       Python backend package
data/sample/                Sample watchlist and OHLCV files
docs/                       System notes and build roadmap
outputs/                    Generated scanner and backtest outputs
paper_accounts/             Local paper-account JSON files, ignored by git
tests/                      Unit tests
```


## Paper trading account

The paper account now starts at **$5,000** by default. This can be changed later in `src/asx_trade_finder/config.py` or by constructing `PaperAccount(starting_cash=...)`.

Paper trading tracks:

- entries and exits
- open and closed trades
- win/loss result
- gross and net P/L
- R-multiple
- brokerage and slippage
- stop, target and exit reason
- recent alerts
- 60-second alert payloads for frontend popups

Useful API endpoints:

```bash
GET  /paper
GET  /paper/trades
POST /paper/enter
POST /paper/exit
POST /paper/reset
```

The frontend should show a trade-entry popup for 60 seconds, or allow the user to close it manually.

## v3 additions

This version adds the planned UI and documentation for:

- $5,000 paper account display
- one-minute trade-entry popup alerts
- sound alerts
- voice readouts using browser SpeechSynthesis
- read-this-setup button
- expanded heatmap with sectors, market, commodities and signal flow
- entry, stop, target and exit instructions read aloud

The dashboard remains paper-testing only. Live trading stays locked until the system has real ASX data, backtest proof, paper-trading results and risk controls.

## Cost model

The paper account and backtest now include entry brokerage, exit brokerage, entry slippage and exit slippage. Results are reported after trading costs. Tax, monthly data fees, margin interest and FX are not deducted automatically because they depend on the user's broker/account setup. See `docs/COST_MODEL.md`.

## v5 sound, voice and alert upgrade

The frontend now has a visible **Enable sound & voice** control. This is required because browsers block audio until the user clicks a button. After enabling it, the dashboard can play alert tones and read paper-trade entry, exit, stop and target instructions aloud.

The paper account still starts at **$5,000** and live trading remains locked.

## v7 GitHub verification

This version is coded and tested for GitHub upload. It includes:

- backend unit tests
- API tests
- scanner sample run
- backtest sample run
- frontend production build
- GitHub Actions CI workflow
- Makefile commands
- package-lock for repeatable frontend installs

Verified locally:

```text
12 passed
frontend npm run build: passed
scanner sample run: passed
backtest sample run: passed
```

See `docs/TESTING_AND_GITHUB.md`.

## Render deployment fix

If Render shows this error:

```text
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/opt/render/project/src/package.json'
```

it means Render is building from the repository root while the frontend app is inside `frontend/`.

This repo now includes a root `package.json`, so root builds work. For the cleanest Render frontend setup use:

```text
Root Directory: frontend
Build Command: npm ci && npm run build
Publish Directory: dist
```

For the API service use:

```text
Build Command: pip install -r requirements.txt && pip install -e .
Start Command: uvicorn asx_trade_finder.api:app --host 0.0.0.0 --port $PORT
```

A `render.yaml` blueprint is also included.
