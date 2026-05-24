from __future__ import annotations

from pathlib import Path
from typing import Dict, Any
from datetime import datetime, timezone
import asyncio
import os
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import TradeSignal, SignalStatus
from .paper import PaperAccount
from .scanner import scan_watchlist
from .market_clock import get_market_clock
from .audit import AuditLog
from .data_quality import assess_price_data
from .institutional import institutional_readiness, signal_risk_book, pre_trade_check
from .auto_paper import latest_prices_from_signals, run_auto_paper_cycle

app = FastAPI(title="ASX Trade Finder API", version="0.8.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WATCHLIST = Path(os.getenv("ASX_WATCHLIST", "data/watchlists/asx_core.csv"))
SAMPLE_WATCHLIST = Path("data/sample/sample_watchlist.csv")
PRICES = Path(os.getenv("ASX_PRICE_ROOT", "data/sample/prices"))
PAPER_PATH = Path(os.getenv("ASX_PAPER_ACCOUNT", "paper_accounts/default.json"))
DATA_PROVIDER = os.getenv("ASX_DATA_PROVIDER", "csv")
DATA_PERIOD = os.getenv("ASX_HISTORY_PERIOD", "10y")
SCAN_INTERVAL_SECONDS = int(os.getenv("ASX_SCAN_INTERVAL_SECONDS", "60"))
AUTO_PAPER_ENABLED = os.getenv("ASX_AUTO_PAPER_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
AUTO_PAPER_MAX_ENTRIES = int(os.getenv("ASX_AUTO_PAPER_MAX_ENTRIES_PER_SCAN", "2"))
AUDIT_PATH = Path(os.getenv("ASX_AUDIT_LOG", "outputs/audit_log.jsonl"))
audit = AuditLog(AUDIT_PATH)

_scan_lock = threading.Lock()
_scan_cache: Dict[str, Any] = {
    "ok": False,
    "refreshed_at": None,
    "provider": DATA_PROVIDER,
    "period": DATA_PERIOD,
    "count": 0,
    "signals": [],
    "error": None,
    "mode": "not_scanned_yet",
}


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


def signal_from_payload(payload: ManualPaperEntry) -> TradeSignal:
    return TradeSignal(
        ticker=payload.ticker.upper(), name=payload.name, sector=payload.sector,
        setup=payload.setup, score=payload.score, grade=payload.grade,
        status=SignalStatus(payload.status), entry=payload.entry, stop=payload.stop,
        target=payload.target, risk_reward=payload.risk_reward,
        volume_multiple=payload.volume_multiple, avg_daily_value=payload.avg_daily_value,
        spread_pct=payload.spread_pct, reasons=["Manual paper entry"], risks=[]
    )


def get_account() -> PaperAccount:
    return PaperAccount.load(PAPER_PATH) if PAPER_PATH.exists() else PaperAccount(starting_cash=5000)


def save_account(account: PaperAccount) -> None:
    account.save(PAPER_PATH)


def run_auto_paper(rows: list[dict], market_open: bool) -> dict:
    account = get_account()
    result = run_auto_paper_cycle(
        account,
        rows,
        market_open=market_open,
        enabled=AUTO_PAPER_ENABLED,
        max_entries=AUTO_PAPER_MAX_ENTRIES,
    )
    if result.get("events"):
        audit.record("AUTO_PAPER_CYCLE", {"entries": result.get("entries"), "exits": result.get("exits"), "events": result.get("events")})
    save_account(account)
    return result


def cached_last_prices() -> dict[str, float]:
    return latest_prices_from_signals(_scan_cache.get("signals") or [])


def _watchlist_path() -> Path:
    return WATCHLIST if WATCHLIST.exists() else SAMPLE_WATCHLIST


def run_scan(provider: str | None = None, period: str | None = None, force: bool = False) -> Dict[str, Any]:
    """Run the signal scanner and keep the latest scan cached.

    The scanner always returns candidates even when the ASX is closed. Closed
    market status only marks the scan as review-only; it must not hide stocks.
    """
    kind = provider or DATA_PROVIDER
    hist = period or DATA_PERIOD
    clock = get_market_clock()
    mode = "live_market_scan" if clock.get("is_open") else "closed_market_review"

    with _scan_lock:
        try:
            df = scan_watchlist(_watchlist_path(), PRICES, kind, hist)
            data = df.to_dict(orient="records")
            auto_paper = run_auto_paper(data, bool(clock.get("is_open")))
            payload = {
                "ok": True,
                "refreshed_at": datetime.now(timezone.utc).isoformat(),
                "provider": kind,
                "period": hist,
                "watchlist": str(_watchlist_path()),
                "market_clock": clock,
                "mode": mode,
                "review_only": not bool(clock.get("is_open")),
                "count": len(data),
                "signals": data,
                "auto_paper": auto_paper,
                "error": None,
                "message": "Market is closed, showing last review candidates. Auto paper entries are paused; exits still check latest prices." if not clock.get("is_open") else "Market is open, auto paper rules are active.",
            }
        except Exception as exc:
            # Keep the app useful rather than blank. Fall back to the bundled CSV
            # watchlist/sample data and clearly report the real provider error.
            try:
                df = scan_watchlist(SAMPLE_WATCHLIST, PRICES, "csv", "10y")
                data = df.to_dict(orient="records")
                payload = {
                    "ok": False,
                    "refreshed_at": datetime.now(timezone.utc).isoformat(),
                    "provider": kind,
                    "period": hist,
                    "watchlist": str(_watchlist_path()),
                    "market_clock": clock,
                    "mode": "fallback_sample_scan",
                    "review_only": True,
                    "count": len(data),
                    "signals": data,
                    "auto_paper": {"enabled": AUTO_PAPER_ENABLED, "entries": 0, "exits": 0, "events": [], "message": "Auto paper did not enter from fallback error scan."},
                    "error": str(exc),
                    "message": "Real data provider failed, showing bundled sample scan so the dashboard does not go blank.",
                }
            except Exception as fallback_exc:
                payload = {
                    "ok": False,
                    "refreshed_at": datetime.now(timezone.utc).isoformat(),
                    "provider": kind,
                    "period": hist,
                    "watchlist": str(_watchlist_path()),
                    "market_clock": clock,
                    "mode": "scan_failed",
                    "review_only": True,
                    "count": 0,
                    "signals": [],
                    "error": f"{exc}; fallback failed: {fallback_exc}",
                    "message": "Scan failed. Check data provider configuration.",
                }
        _scan_cache.update(payload)
        audit.record("SCAN_COMPLETED", {"provider": payload.get("provider"), "period": payload.get("period"), "mode": payload.get("mode"), "count": payload.get("count"), "ok": payload.get("ok")})
        return payload


async def background_scanner() -> None:
    """Keep refreshing while the API process is awake.

    On Render Free this stops when the service sleeps. A paid instance or
    external keepalive is required for true continuous operation.
    """
    await asyncio.sleep(3)
    while True:
        try:
            await asyncio.to_thread(run_scan)
        except Exception:
            pass
        await asyncio.sleep(max(30, SCAN_INTERVAL_SECONDS))


@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(background_scanner())


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "asx-trade-finder-api", "time_utc": datetime.now(timezone.utc).isoformat()}


@app.get("/keepalive")
def keepalive() -> Dict[str, str]:
    audit.record("KEEPALIVE", {"last_scan": str(_scan_cache.get("refreshed_at"))})
    return {"status": "awake", "time_utc": datetime.now(timezone.utc).isoformat(), "last_scan": str(_scan_cache.get("refreshed_at"))}


@app.get("/market-clock")
def market_clock():
    return get_market_clock()


@app.get("/signals")
def signals(provider: str | None = None, period: str | None = None, force: bool = False):
    # Always return candidates. If market is closed, mark review_only instead of hiding trades.
    if force or not _scan_cache.get("refreshed_at") or provider or period:
        return run_scan(provider, period, force=True)
    cached = dict(_scan_cache)
    cached["market_clock"] = get_market_clock()
    cached["review_only"] = not bool(cached["market_clock"].get("is_open"))
    cached["mode"] = "live_market_scan" if cached["market_clock"].get("is_open") else "closed_market_review"
    cached["message"] = "Market is closed, showing last review candidates." if cached["review_only"] else "Market is open, showing active scan candidates."
    return cached

@app.get("/institutional-readiness")
def institutional_status():
    cached = signals()
    readiness = institutional_readiness(str(cached.get("provider")), str(cached.get("period")), int(cached.get("count") or 0), str(cached.get("mode")))
    readiness["risk_book"] = signal_risk_book(cached.get("signals") or [])
    readiness["market_clock"] = cached.get("market_clock")
    return readiness


@app.get("/audit")
def audit_tail(limit: int = 100):
    return {"count": len(audit.tail(limit)), "events": audit.tail(limit)}


@app.get("/data-quality/{ticker}")
def data_quality(ticker: str, provider: str | None = None, period: str | None = None):
    from .data_provider import get_data_provider
    kind = provider or DATA_PROVIDER
    hist = period or DATA_PERIOD
    prov = get_data_provider(kind, PRICES, hist)
    try:
        df = prov.load_prices(ticker.upper())
    except Exception:
        prov = get_data_provider("csv", PRICES, "10y")
        df = prov.load_prices(ticker.upper())
    report = assess_price_data(ticker, df)
    return report.to_dict()



@app.post("/refresh")
def refresh_signals(provider: str | None = None, period: str | None = None):
    return run_scan(provider, period, force=True)


@app.get("/prices/{ticker}")
def prices(ticker: str, provider: str | None = None, period: str | None = None):
    from .data_provider import get_data_provider
    kind = provider or DATA_PROVIDER
    hist = period or DATA_PERIOD
    prov = get_data_provider(kind, PRICES, hist)
    try:
        df = prov.load_prices(ticker.upper()).tail(260).copy()
    except Exception:
        # Fallback lets chart click-through still work with bundled sample tickers.
        prov = get_data_provider("csv", PRICES, "10y")
        df = prov.load_prices(ticker.upper()).tail(260).copy()
    df["date"] = df["date"].astype(str)
    return {"ticker": ticker.upper(), "provider": kind, "period": hist, "count": len(df), "prices": df.to_dict(orient="records")}


@app.get("/paper/auto")
def paper_auto_status():
    return {
        "enabled": AUTO_PAPER_ENABLED,
        "max_entries_per_scan": AUTO_PAPER_MAX_ENTRIES,
        "market_clock": get_market_clock(),
        "last_scan": _scan_cache.get("refreshed_at"),
        "last_auto_paper": _scan_cache.get("auto_paper"),
    }


@app.post("/paper/auto/run")
def paper_auto_run():
    cached = signals(force=True)
    return {"ok": True, "auto_paper": cached.get("auto_paper"), "paper": get_account().mark_to_market(cached_last_prices())}


@app.get("/paper")
def paper_account():
    account = get_account()
    result = account.mark_to_market(cached_last_prices())
    result["market_clock"] = get_market_clock()
    return result


@app.get("/paper/trades")
def paper_trades():
    account = get_account()
    return {"stats": account.stats(), "trades": account.trade_journal()}



@app.post("/risk/pretrade")
def risk_pretrade(payload: ManualPaperEntry):
    account = get_account()
    signal = signal_from_payload(payload)
    result = pre_trade_check(signal, bool(get_market_clock().get("is_open")), account.equity())
    audit.record("PRETRADE_CHECK", {"ticker": signal.ticker, "approved": result.get("approved")})
    return result

@app.post("/paper/enter")
def enter_paper_trade(payload: ManualPaperEntry):
    account = get_account()
    clock = get_market_clock()
    if not clock.get("is_open"):
        audit.record("PAPER_ENTRY_BLOCKED", {"ticker": payload.ticker, "reason": "market_closed"})
        raise HTTPException(status_code=400, detail="ASX market is closed. Paper entry is blocked unless you use manual review outside market hours.")
    signal = signal_from_payload(payload)
    check = pre_trade_check(signal, True, account.equity())
    if not check.get("approved"):
        audit.record("PAPER_ENTRY_BLOCKED", {"ticker": signal.ticker, "reason": "pretrade_failed", "check": check})
        raise HTTPException(status_code=400, detail={"message": "Pre-trade check failed.", "check": check})
    try:
        alert = account.enter_from_signal(signal)
        audit.record("PAPER_TRADE_ENTERED", {"ticker": signal.ticker, "score": signal.score, "entry": signal.entry, "stop": signal.stop, "target": signal.target})
        save_account(account)
        return {"ok": True, "alert": alert, "paper": account.mark_to_market({})}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/paper/exit")
def exit_paper_trade(payload: ManualPaperExit):
    account = get_account()
    try:
        fill = account.close_position(payload.ticker, payload.exit_price, payload.reason)
        audit.record("PAPER_TRADE_EXITED", {"ticker": payload.ticker.upper(), "exit_price": payload.exit_price, "reason": payload.reason})
        save_account(account)
        return {"ok": True, "fill": fill.to_dict(), "paper": account.mark_to_market({})}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/paper/reset")
def reset_paper():
    account = PaperAccount(starting_cash=5000)
    audit.record("PAPER_ACCOUNT_RESET", {"starting_cash": 5000})
    save_account(account)
    return account.mark_to_market({})
