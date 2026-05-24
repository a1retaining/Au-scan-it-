from asx_trade_finder.costs import CostModel


def test_round_trip_costs_include_entry_and_exit():
    costs = CostModel()
    breakdown = costs.round_trip(qty=10, entry_price=100, exit_price=110)
    assert breakdown.entry_brokerage > 0
    assert breakdown.exit_brokerage > 0
    assert breakdown.total_costs == breakdown.total_brokerage + breakdown.total_slippage


def test_slippage_changes_executable_prices():
    costs = CostModel()
    buy = costs.executable_price(__import__('asx_trade_finder.models').models.Side.BUY, 10)
    sell = costs.executable_price(__import__('asx_trade_finder.models').models.Side.SELL, 10)
    assert buy > 10
    assert sell < 10
