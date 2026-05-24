from __future__ import annotations

from dataclasses import dataclass, asdict
from .config import DEFAULT_CONFIG, TradingConfig
from .models import Side


@dataclass(frozen=True)
class CostBreakdown:
    entry_value: float
    exit_value: float
    entry_brokerage: float
    exit_brokerage: float
    entry_slippage: float
    exit_slippage: float
    total_brokerage: float
    total_slippage: float
    total_costs: float
    estimated_tax: float = 0.0
    note: str = "Tax is not deducted automatically. Brokerage and GST-inclusive broker fees should be kept for CGT records."

    def to_dict(self) -> dict:
        return asdict(self)


class CostModel:
    """Execution-cost model used by paper trading and backtests.

    Costs modelled now:
    - brokerage on entry
    - brokerage on exit
    - simulated slippage on entry
    - simulated slippage on exit

    Costs not deducted as trade expenses now:
    - income tax / CGT, because it depends on the user's personal tax position
    - margin interest, because live margin is disabled
    - market data subscriptions, because provider choice is not locked in yet
    """

    def __init__(self, config: TradingConfig = DEFAULT_CONFIG):
        self.config = config

    def brokerage(self, gross_value: float) -> float:
        return round(max(self.config.brokerage_min, gross_value * self.config.brokerage_bps), 2)

    def slippage_per_share(self, side: Side, price: float) -> float:
        return round(price * self.config.slippage_bps, 4)

    def executable_price(self, side: Side, price: float) -> float:
        slip = self.slippage_per_share(side, price)
        return round(price + slip if side == Side.BUY else price - slip, 4)

    def round_trip(self, qty: int, entry_price: float, exit_price: float) -> CostBreakdown:
        entry_exec = self.executable_price(Side.BUY, entry_price)
        exit_exec = self.executable_price(Side.SELL, exit_price)
        entry_value = round(qty * entry_exec, 2)
        exit_value = round(qty * exit_exec, 2)
        entry_brokerage = self.brokerage(entry_value)
        exit_brokerage = self.brokerage(exit_value)
        entry_slippage = round(qty * abs(entry_exec - entry_price), 2)
        exit_slippage = round(qty * abs(exit_exec - exit_price), 2)
        total_brokerage = round(entry_brokerage + exit_brokerage, 2)
        total_slippage = round(entry_slippage + exit_slippage, 2)
        return CostBreakdown(
            entry_value=entry_value,
            exit_value=exit_value,
            entry_brokerage=entry_brokerage,
            exit_brokerage=exit_brokerage,
            entry_slippage=entry_slippage,
            exit_slippage=exit_slippage,
            total_brokerage=total_brokerage,
            total_slippage=total_slippage,
            total_costs=round(total_brokerage + total_slippage, 2),
        )
