from __future__ import annotations

from typing import Any, Dict, Iterable, List

from .config import DEFAULT_CONFIG, TradingConfig
from .institutional import pre_trade_check
from .models import SignalStatus, TradeSignal
from .paper import PaperAccount


def _float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _status(value: Any) -> SignalStatus:
    raw = str(value or "BLOCKED").upper()
    if raw == "REVIEW":
        # Review candidates can be shown after hours, but automatic paper
        # execution only uses READY/ARMED signals.
        raw = "ARMED"
    try:
        return SignalStatus(raw)
    except Exception:
        return SignalStatus.BLOCKED


def signal_from_row(row: Dict[str, Any]) -> TradeSignal:
    entry = _float(row.get("entry") or row.get("close") or row.get("price"))
    stop = _float(row.get("stop") or row.get("stop_loss"), entry * 0.97 if entry else 0)
    target = _float(row.get("target"), entry * 1.06 if entry else 0)
    risk_reward = _float(row.get("risk_reward") or row.get("rr"), ((target - entry) / max(entry - stop, 0.01)) if entry else 0)
    return TradeSignal(
        ticker=str(row.get("ticker") or "").upper(),
        name=str(row.get("name") or row.get("ticker") or "Unknown"),
        sector=str(row.get("sector") or "Unknown"),
        setup=str(row.get("setup") or "Auto paper setup"),
        score=_float(row.get("score")),
        grade=str(row.get("grade") or ""),
        status=_status(row.get("status")),
        entry=entry,
        stop=stop,
        target=target,
        risk_reward=risk_reward,
        volume_multiple=_float(row.get("volume_multiple") or row.get("volume"), 1.0),
        avg_daily_value=_float(row.get("avg_daily_value"), 1_000_000),
        spread_pct=_float(row.get("spread_pct"), 0.0025),
        reasons=list(row.get("reasons") or row.get("why") or []),
        risks=list(row.get("risks") or []),
        blockers=list(row.get("blockers") or []),
        confidence=_float(row.get("confidence")),
    )


def latest_prices_from_signals(rows: Iterable[Dict[str, Any]]) -> Dict[str, float]:
    prices: Dict[str, float] = {}
    for row in rows:
        ticker = str(row.get("ticker") or "").upper()
        if not ticker:
            continue
        prices[ticker] = _float(row.get("price") or row.get("close") or row.get("entry"))
    return prices


def run_auto_paper_cycle(
    account: PaperAccount,
    rows: List[Dict[str, Any]],
    *,
    market_open: bool,
    enabled: bool = True,
    max_entries: int = 2,
    config: TradingConfig = DEFAULT_CONFIG,
) -> Dict[str, Any]:
    """Automatically manage the paper account from scan signals.

    This is paper only. It does not connect to a broker. It exits existing paper
    positions when stop/target rules are hit, then enters new paper positions
    only when the ASX is open and the signal passes the pre-trade gates.
    """
    events: List[Dict[str, Any]] = []
    last_prices = latest_prices_from_signals(rows)

    # Manage exits first so capital/risk is freed before new entries.
    exit_events = account.process_stops_targets(last_prices)
    events.extend(exit_events)

    if not enabled:
        return {"enabled": False, "market_open": market_open, "entries": 0, "exits": len(exit_events), "events": events}
    if not market_open:
        return {"enabled": True, "market_open": False, "entries": 0, "exits": len(exit_events), "events": events, "message": "Market closed. Auto paper entries paused; exits are still checked from latest data."}

    entries = 0
    existing = set(account.positions.keys())
    sorted_rows = sorted(rows, key=lambda r: _float(r.get("score")), reverse=True)
    for row in sorted_rows:
        if entries >= max_entries:
            break
        signal = signal_from_row(row)
        if not signal.ticker or signal.ticker in existing:
            continue
        if signal.status not in {SignalStatus.READY, SignalStatus.ARMED}:
            continue
        if signal.score < config.min_score_paper:
            continue
        if signal.risk_reward < config.min_risk_reward:
            continue
        if signal.blockers:
            continue
        check = pre_trade_check(signal, market_open, account.equity(last_prices))
        if not check.get("approved"):
            events.append({"event_type": "AUTO_ENTRY_SKIPPED", "ticker": signal.ticker, "reason": "pretrade_failed", "check": check})
            continue
        try:
            alert = account.enter_from_signal(signal, market_price=last_prices.get(signal.ticker) or signal.entry)
            alert["event_type"] = "AUTO_PAPER_TRADE_ENTERED"
            alert["message"] = f"{signal.ticker} auto paper trade entered by rules"
            events.append(alert)
            existing.add(signal.ticker)
            entries += 1
        except Exception as exc:
            events.append({"event_type": "AUTO_ENTRY_SKIPPED", "ticker": signal.ticker, "reason": str(exc)})

    return {"enabled": True, "market_open": market_open, "entries": entries, "exits": len(exit_events), "events": events}
