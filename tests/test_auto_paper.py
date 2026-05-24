from asx_trade_finder.auto_paper import run_auto_paper_cycle
from asx_trade_finder.models import SignalStatus, TradeSignal
from asx_trade_finder.paper import PaperAccount


def row(ticker="CBA", price=100.0, status="READY"):
    return {
        "ticker": ticker,
        "name": ticker,
        "sector": "Banks",
        "setup": "Momentum breakout",
        "score": 88,
        "grade": "A",
        "status": status,
        "entry": price,
        "price": price,
        "stop": price - 2,
        "target": price + 6,
        "risk_reward": 3.0,
        "volume_multiple": 1.6,
        "avg_daily_value": 5_000_000,
        "spread_pct": 0.001,
        "reasons": ["test"],
        "risks": [],
        "blockers": [],
    }


def test_auto_paper_enters_ready_signal_when_market_open():
    account = PaperAccount()
    result = run_auto_paper_cycle(account, [row()], market_open=True, enabled=True)
    assert result["entries"] == 1
    assert "CBA" in account.positions
    assert account.trades[0].status == "OPEN"


def test_auto_paper_does_not_enter_when_market_closed():
    account = PaperAccount()
    result = run_auto_paper_cycle(account, [row()], market_open=False, enabled=True)
    assert result["entries"] == 0
    assert not account.positions


def test_auto_paper_exits_on_target():
    account = PaperAccount()
    run_auto_paper_cycle(account, [row(price=100)], market_open=True, enabled=True)
    result = run_auto_paper_cycle(account, [row(price=107)], market_open=True, enabled=True)
    assert result["exits"] == 1
    assert not account.positions
    assert account.trades[0].status == "CLOSED"
    assert account.trades[0].exit_reason == "Target hit"
