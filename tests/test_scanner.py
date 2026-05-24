from asx_trade_finder.scanner import scan_watchlist


def test_scanner_outputs_rows():
    output = scan_watchlist('data/sample/sample_watchlist.csv', 'data/sample/prices')
    assert len(output) == 4
    assert {'ticker', 'score', 'status', 'plain_english'}.issubset(output.columns)
