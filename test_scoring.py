from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TradingConfig:
    starting_cash: float = 5_000.0
    max_risk_per_trade_pct: float = 0.005
    max_total_open_risk_pct: float = 0.04
    max_sector_exposure_pct: float = 0.30
    min_score_live: float = 85.0
    min_score_paper: float = 75.0
    min_risk_reward: float = 2.0
    min_avg_daily_value: float = 1_000_000.0
    max_spread_pct: float = 0.006
    brokerage_min: float = 9.50
    brokerage_bps: float = 0.0008
    slippage_bps: float = 0.0005
    broker_name: str = "generic_asx"
    market_data_monthly_cost: float = 0.0
    include_tax_estimates: bool = False
    kill_switch_drawdown_pct: float = 0.05
    kill_switch_consecutive_losses: int = 5


DEFAULT_CONFIG = TradingConfig()
