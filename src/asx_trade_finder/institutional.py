from __future__ import annotations

from typing import Any, Dict, Iterable, List

from .models import TradeSignal


def institutional_readiness(provider: str, period: str, count: int, mode: str) -> Dict[str, Any]:
    """Return a transparent readiness checklist.

    This makes the app think more like a professional desk: data, model,
    execution, risk, operations and audit are separate gates.
    """
    items = [
        {"gate": "Market data", "status": "PASS" if provider in {"yfinance", "csv"} else "WARN", "note": f"Provider configured: {provider}. Licensed real-time feed still recommended."},
        {"gate": "History depth", "status": "PASS" if str(period).lower() in {"10y", "max"} else "WARN", "note": f"Requested history period: {period}."},
        {"gate": "Universe coverage", "status": "PASS" if count >= 40 else "WARN", "note": f"Current scan returned {count} candidates."},
        {"gate": "Delisted securities", "status": "BLOCKED", "note": "Not available without a survivorship-bias-free data source."},
        {"gate": "Announcements/events", "status": "PLANNED", "note": "ASX announcements and event-risk feed must be connected."},
        {"gate": "Paper trading", "status": "PASS", "note": "$5,000 paper account is active. Broker execution locked."},
        {"gate": "Audit trail", "status": "PASS", "note": "Scan, risk and paper events can be written to outputs/audit_log.jsonl."},
        {"gate": "Live trading", "status": "LOCKED", "note": "Correctly disabled until backtest, forward test and paper account prove the edge."},
    ]
    score_map = {"PASS": 1.0, "WARN": 0.55, "PLANNED": 0.35, "BLOCKED": 0.0, "LOCKED": 0.6}
    score = round(sum(score_map[i["status"]] for i in items) / len(items) * 100, 1)
    return {"score": score, "mode": mode, "items": items, "live_trading_allowed": False}


def signal_risk_book(signals: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    rows = list(signals)
    if not rows:
        return {"count": 0, "ready": 0, "blocked": 0, "avg_score": 0, "top_sector": None, "sector_counts": {}}
    sector_counts: Dict[str, int] = {}
    ready = 0
    blocked = 0
    for r in rows:
        sector = str(r.get("sector") or "Unknown")
        sector_counts[sector] = sector_counts.get(sector, 0) + 1
        status = str(r.get("status") or "").upper()
        if status in {"READY", "ARMED"}:
            ready += 1
        if status == "BLOCKED":
            blocked += 1
    top_sector = max(sector_counts.items(), key=lambda x: x[1])[0] if sector_counts else None
    return {
        "count": len(rows),
        "ready": ready,
        "blocked": blocked,
        "avg_score": round(sum(float(r.get("score") or 0) for r in rows) / len(rows), 2),
        "top_sector": top_sector,
        "sector_counts": sector_counts,
    }


def pre_trade_check(signal: TradeSignal, market_open: bool, account_equity: float, max_trade_value_pct: float = 0.25) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    def add(name: str, passed: bool, note: str) -> None:
        checks.append({"name": name, "passed": bool(passed), "note": note})

    add("Market open", market_open, "Paper entries are blocked while ASX is closed." if not market_open else "ASX session is open.")
    add("Signal score", signal.score >= 75, f"Score is {signal.score}.")
    add("Status", signal.status.value in {"READY", "ARMED"}, f"Status is {signal.status.value}.")
    add("Risk/reward", signal.risk_reward >= 2.0, f"R/R is {signal.risk_reward}.")
    add("Stop valid", signal.stop < signal.entry, f"Entry {signal.entry}, stop {signal.stop}.")
    add("Liquidity", signal.avg_daily_value >= 1_000_000, f"Avg daily value {signal.avg_daily_value:,.0f}.")
    trade_value = max(signal.entry, 0) * max(int((account_equity * 0.005) // max(signal.entry - signal.stop, 0.01)), 0)
    add("Concentration", trade_value <= account_equity * max_trade_value_pct, f"Estimated trade value {trade_value:,.2f}; limit {account_equity * max_trade_value_pct:,.2f}.")

    approved = all(c["passed"] for c in checks)
    return {"approved": approved, "checks": checks, "trade_value_estimate": round(trade_value, 2)}
