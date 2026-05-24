from __future__ import annotations

from pathlib import Path
from typing import Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .models import TradeSignal, SignalStatus
from .paper import PaperAccount
from .scanner import scan_watchlist

app = FastAPI(title="ASX Trade Finder API", version="0.3.0")

WATCHLIST = Path("data/sample/sample_watchlist.csv")
PRICES = Path("data/sample/prices")
PAPER_PATH = Path("paper_accounts/default.json")


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
    return {"status": "ok"}


@app.get("/signals")
def signals():
    return scan_watchlist(WATCHLIST, PRICES).to_dict(orient="records")


@app.get("/paper")
def paper_account():
    account = get_account()
    return account.mark_to_market({})


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
