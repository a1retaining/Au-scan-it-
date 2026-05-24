from asx_trade_finder.models import SignalStatus, TradeSignal
from asx_trade_finder.paper import PaperAccount


def make_signal():
    return TradeSignal(
        ticker="CBA", name="Commonwealth Bank", sector="Banks", setup="Clean pullback",
        score=91, grade="A+", status=SignalStatus.READY, entry=100.0, stop=98.0,
        target=106.0, risk_reward=3.0, volume_multiple=1.5,
        avg_daily_value=5_000_000, spread_pct=0.001,
    )


def test_paper_account_starts_at_5000():
    account = PaperAccount()
    assert account.starting_cash == 5000
    assert account.cash == 5000


def test_enter_from_signal_creates_alert_and_trade():
    account = PaperAccount()
    alert = account.enter_from_signal(make_signal())
    assert alert["event_type"] == "TRADE_ENTERED"
    assert alert["auto_close_seconds"] == 60
    assert len(account.trades) == 1
    assert account.trades[0].status == "OPEN"


def test_close_position_records_win_loss_and_r_multiple():
    account = PaperAccount()
    account.enter_from_signal(make_signal())
    account.close_position("CBA", 106.0, "Target hit")
    journal = account.trade_journal()
    assert journal[0]["status"] == "CLOSED"
    assert journal[0]["result"] in {"WIN", "LOSS", "BREAKEVEN"}
    assert journal[0]["exit_reason"] == "Target hit"
    assert "r_multiple" in journal[0]


def test_closed_trade_net_pnl_includes_entry_and_exit_brokerage():
    account = PaperAccount()
    account.enter_from_signal(make_signal())
    account.close_position("CBA", 106.0, "Target hit")
    trade = account.trade_journal()[0]
    assert trade["brokerage"] == 19.0
    assert trade["net_pnl"] < trade["gross_pnl"] - 9.5
    assert trade["net_pnl"] == round(trade["gross_pnl"] - trade["brokerage"], 2)
