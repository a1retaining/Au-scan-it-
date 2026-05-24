from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable

from .config import TradingConfig, DEFAULT_CONFIG
from .models import PaperPosition, TradeSignal


@dataclass(frozen=True)
class PositionSizeResult:
    qty: int
    dollar_risk: float
    position_value: float
    risk_per_share: float
    blocked: bool
    reason: str


class RiskManager:
    def __init__(self, config: TradingConfig = DEFAULT_CONFIG):
        self.config = config

    def position_size(self, account_equity: float, signal: TradeSignal) -> PositionSizeResult:
        risk_per_share = max(signal.entry - signal.stop, 0)
        if risk_per_share <= 0:
            return PositionSizeResult(0, 0, 0, 0, True, "Invalid stop. Stop must be below entry for long trades.")

        dollar_risk = account_equity * self.config.max_risk_per_trade_pct
        qty = int(dollar_risk // risk_per_share)
        position_value = qty * signal.entry

        if qty <= 0:
            return PositionSizeResult(0, dollar_risk, position_value, risk_per_share, True, "Account risk is too small for the stop distance.")
        if signal.risk_reward < self.config.min_risk_reward:
            return PositionSizeResult(qty, dollar_risk, position_value, risk_per_share, True, "Risk-to-reward is below minimum.")
        if signal.avg_daily_value < self.config.min_avg_daily_value:
            return PositionSizeResult(qty, dollar_risk, position_value, risk_per_share, True, "Average daily value is too low.")
        if signal.spread_pct > self.config.max_spread_pct:
            return PositionSizeResult(qty, dollar_risk, position_value, risk_per_share, True, "Spread is too wide.")

        return PositionSizeResult(qty, dollar_risk, position_value, risk_per_share, False, "Approved by risk model.")

    def total_open_risk(self, positions: Iterable[PaperPosition], last_prices: Dict[str, float]) -> float:
        risk = 0.0
        for pos in positions:
            if pos.stop is None:
                continue
            risk += max(pos.avg_price - pos.stop, 0) * pos.qty
        return risk

    def kill_switch_active(self, starting_equity: float, current_equity: float, consecutive_losses: int) -> bool:
        drawdown = 1 - current_equity / starting_equity if starting_equity else 0
        return drawdown >= self.config.kill_switch_drawdown_pct or consecutive_losses >= self.config.kill_switch_consecutive_losses
