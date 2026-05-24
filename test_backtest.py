from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class SignalStatus(str, Enum):
    READY = "READY"
    ARMED = "ARMED"
    WATCH = "WATCH"
    BLOCKED = "BLOCKED"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


@dataclass(frozen=True)
class MarketRegime:
    market_score: float
    trend_score: float
    breadth_score: float
    sector_flow_score: float
    risk_score: float
    volume_score: float
    description: str
    long_allowed: bool


@dataclass(frozen=True)
class TradeSignal:
    ticker: str
    name: str
    sector: str
    setup: str
    score: float
    grade: str
    status: SignalStatus
    entry: float
    stop: float
    target: float
    risk_reward: float
    volume_multiple: float
    avg_daily_value: float
    spread_pct: float
    reasons: List[str] = field(default_factory=list)
    risks: List[str] = field(default_factory=list)
    blockers: List[str] = field(default_factory=list)
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["status"] = self.status.value
        return data


@dataclass
class PaperOrder:
    order_id: str
    ticker: str
    side: Side
    qty: int
    order_type: str
    price: Optional[float]
    stop: Optional[float]
    target: Optional[float]
    created_at: str
    status: str = "OPEN"

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["side"] = self.side.value
        return data


@dataclass
class PaperPosition:
    ticker: str
    qty: int
    avg_price: float
    stop: Optional[float]
    target: Optional[float]
    opened_at: str

    def market_value(self, last_price: float) -> float:
        return self.qty * last_price

    def unrealized_pnl(self, last_price: float) -> float:
        return (last_price - self.avg_price) * self.qty


@dataclass
class PaperFill:
    fill_id: str
    order_id: str
    ticker: str
    side: Side
    qty: int
    price: float
    brokerage: float
    slippage: float
    filled_at: str

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["side"] = self.side.value
        return data


@dataclass
class PaperTrade:
    trade_id: str
    ticker: str
    side: Side
    qty: int
    entry_price: float
    entry_time: str
    stop: Optional[float]
    target: Optional[float]
    setup: str = ""
    score: float = 0.0
    status: str = "OPEN"
    exit_price: Optional[float] = None
    exit_time: Optional[str] = None
    exit_reason: Optional[str] = None
    gross_pnl: float = 0.0
    net_pnl: float = 0.0
    brokerage: float = 0.0
    slippage: float = 0.0
    r_multiple: float = 0.0
    result: str = "OPEN"

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["side"] = self.side.value
        return data
