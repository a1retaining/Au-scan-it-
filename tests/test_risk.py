from asx_trade_finder.data_provider import CSVDataProvider
from asx_trade_finder.scoring import ASXSignalScorer
from asx_trade_finder.risk import RiskManager


def test_position_size_allows_valid_signal():
    provider = CSVDataProvider('data/sample/prices')
    prices = provider.load_prices('CBA')
    signal = ASXSignalScorer().score_dataframe('CBA', 'Commonwealth Bank', 'Banks', prices)
    result = RiskManager().position_size(100000, signal)
    assert result.qty >= 0
    assert result.risk_per_share >= 0
