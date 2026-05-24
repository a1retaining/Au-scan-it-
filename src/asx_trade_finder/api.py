from __future__ import annotations

from pathlib import Path
from typing import Dict
from datetime import datetime, timezone
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import TradeSignal, SignalStatus
from .paper import PaperAccount
from .scanner import scan_watchlist
from .market_clock import get_market_clock

app = FastAPI(title="ASX Trade Finder API", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WATCHLIST = Path("data/sample/sample_watchlist.csv")
PRICES = Path("data/sample/prices")
PAPER_PATH = Path("paper_accounts/default.json")
DATA_PROVIDER = os.getenv("ASX_DATA_PROVIDER", "csv")
DATA_PERIOD = os.getenv("ASX_HISTORY_PERIOD", "10y")


class ManualPaperEntry(BaseModel):
    ticker: str
    name: str = "Manual paper trade"
    sector: str = "Unknown"
    setup: str = "manual"
    score: float = 80
    grade: str = "A"
    status: str = "READY"
    entry: float
    stop: float
    target: float
    risk_reward: float = 2.0
    volume_multiple: float = 1.0
    avg_daily_value: float = 1_000_000
    spread_pct: float = 0.001


class ManualPaperExit(BaseModel):
    ticker: str
    exit_price: float
    reason: str = "Manual exit"


def get_account() -> PaperAccount:
    return PaperAccount.load(PAPER_PATH) if PAPER_PATH.exists() else PaperAccount()


def save_account(account: PaperAccount) -> None:
    account.save(PAPER_PATH)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "asx-trade-finder-api", "time_utc": datetime.now(timezone.utc).isoformat()}


@app.get("/keepalive")
def keepalive() -> Dict[str, str]:
    """Lightweight endpoint for uptime monitors or Render cron pings."""
    return {"status": "awake", "time_utc": datetime.now(timezone.utc).isoformat()}


@app.get("/market-clock")
def market_clock():
    return get_market_clock()


@app.get("/signals")
def signals(provider: str | None = None, period: str | None = None):
    kind = provider or DATA_PROVIDER
    hist = period or DATA_PERIOD
    data = scan_watchlist(WATCHLIST, PRICES, kind, hist).to_dict(orient="records")
    return {"refreshed_at": datetime.now(timezone.utc).isoformat(), "provider": kind, "period": hist, "market_clock": get_market_clock(), "count": len(data), "signals": data}


@app.post("/refresh")
def refresh_signals(provider: str | None = None, period: str | None = None):
    """Force a scan refresh. Set ASX_DATA_PROVIDER=yfinance for delayed real ASX data."""
    kind = provider or DATA_PROVIDER
    hist = period or DATA_PERIOD
    data = scan_watchlist(WATCHLIST, PRICES, kind, hist).to_dict(orient="records")
    return {"ok": True, "refreshed_at": datetime.now(timezone.utc).isoformat(), "provider": kind, "period": hist, "market_clock": get_market_clock(), "count": len(data), "signals": data}


@app.get("/prices/{ticker}")
def prices(ticker: str, provider: str | None = None, period: str | None = None):
    """Return recent OHLCV history for chart click-through.

    Uses ASX_DATA_PROVIDER=yfinance for delayed real ASX prices or csv for sample testing.
    """
    from .data_provider import get_data_provider
    kind = provider or DATA_PROVIDER
    hist = period or DATA_PERIOD
    prov = get_data_provider(kind, PRICES, hist)
    df = prov.load_prices(ticker.upper()).tail(260).copy()
    df["date"] = df["date"].astype(str)
    return {"ticker": ticker.upper(), "provider": kind, "period": hist, "count": len(df), "prices": df.to_dict(orient="records")}


@app.get("/paper")
def paper_account():
    account = get_account()
    result = account.mark_to_market({})
    result["market_clock"] = get_market_clock()
    return result


@app.get("/paper/trades")
def paper_trades():
    account = get_account()
    return {"stats": account.stats(), "trades": account.trade_journal()}


@app.post("/paper/enter")
def enter_paper_trade(payload: ManualPaperEntry):
    account = get_account()
    signal = TradeSignal(
        ticker=payload.ticker.upper(), name=payload.name, sector=payload.sector,
        setup=payload.setup, score=payload.score, grade=payload.grade,
        status=SignalStatus(payload.status), entry=payload.entry, stop=payload.stop,
        target=payload.target, risk_reward=payload.risk_reward,
        volume_multiple=payload.volume_multiple, avg_daily_value=payload.avg_daily_value,
        spread_pct=payload.spread_pct, reasons=["Manual paper entry"], risks=[]
    )
    try:
        alert = account.enter_from_signal(signal)
        save_account(account)
        return {"ok": True, "alert": alert, "paper": account.mark_to_market({})}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/paper/exit")
def exit_paper_trade(payload: ManualPaperExit):
    account = get_account()
    try:
        fill = account.close_position(payload.ticker, payload.exit_price, payload.reason)
        save_account(account)
        return {"ok": True, "fill": fill.to_dict(), "paper": account.mark_to_market({})}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/paper/reset")
def reset_paper():
    account = PaperAccount(starting_cash=5000)
    save_account(account)
    return account.mark_to_market({})
