from asx_trade_finder.data_provider import CSVDataProvider
from asx_trade_finder.scoring import ASXSignalScorer


def test_scoring_returns_signal():
    provider = CSVDataProvider('data/sample/prices')
    prices = provider.load_prices('CBA')
    signal = ASXSignalScorer().score_dataframe('CBA', 'Commonwealth Bank', 'Banks', prices)
    assert signal.ticker == 'CBA'
    assert 0 <= signal.score <= 100
    assert signal.entry > signal.stop
    assert signal.target > signal.entry
