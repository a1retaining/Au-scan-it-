from asx_trade_finder.backtest import run_simple_backtest, summarise_backtest


def test_backtest_summary_runs():
    results = run_simple_backtest('data/sample/sample_watchlist.csv', 'data/sample/prices')
    summary = summarise_backtest(results)
    assert 'trades' in summary
    assert summary['trades'] >= 0
