from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from .config import DEFAULT_CONFIG, TradingConfig
from .models import PaperFill, PaperOrder, PaperPosition, PaperTrade, Side, TradeSignal
from .risk import RiskManager
from .costs import CostModel


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PaperAccount:
    """Paper trading account used to test signals before real money.

    It intentionally has no broker connection. It simulates entries, exits,
    brokerage, slippage, stops, targets, position sizing, equity, trade history,
    win/loss stats, R-multiples, and kill-switch protection.
    """

    def __init__(self, name: str = "default", starting_cash: float = DEFAULT_CONFIG.starting_cash, config: TradingConfig = DEFAULT_CONFIG):
        self.name = name
        self.config = config
        self.starting_cash = starting_cash
        self.cash = starting_cash
        self.positions: Dict[str, PaperPosition] = {}
        self.orders: Dict[str, PaperOrder] = {}
        self.fills: List[PaperFill] = []
        self.trades: List[PaperTrade] = []
        self.closed_pnl: List[float] = []
        self.alerts: List[dict] = []
        self.risk = RiskManager(config)
        self.costs = CostModel(config)

    def brokerage(self, gross_value: float) -> float:
        return self.costs.brokerage(gross_value)

    def slippage_adjusted_price(self, side: Side, price: float) -> tuple[float, float]:
        executable = self.costs.executable_price(side, price)
        slippage = abs(executable - price)
        return executable, slippage

    def equity(self, last_prices: Optional[Dict[str, float]] = None) -> float:
        total = self.cash
        last_prices = last_prices or {}
        for ticker, pos in self.positions.items():
            total += pos.qty * last_prices.get(ticker, pos.avg_price)
        return total

    def consecutive_losses(self) -> int:
        count = 0
        for pnl in reversed(self.closed_pnl):
            if pnl < 0:
                count += 1
            else:
                break
        return count

    def place_from_signal(self, signal: TradeSignal, account_equity: Optional[float] = None) -> PaperOrder:
        account_equity = account_equity if account_equity is not None else self.equity()
        if self.risk.kill_switch_active(self.starting_cash, account_equity, self.consecutive_losses()):
            raise RuntimeError("Kill switch active. New paper orders are blocked until review.")
        size = self.risk.position_size(account_equity, signal)
        if size.blocked:
            raise ValueError(f"Signal blocked by risk model: {size.reason}")
        return self.place_order(signal.ticker, Side.BUY, size.qty, "MARKET", signal.entry, signal.stop, signal.target)

    def enter_from_signal(self, signal: TradeSignal, market_price: Optional[float] = None) -> dict:
        """Create and fill a paper trade from a signal, then return alert payload."""
        order = self.place_from_signal(signal)
        fill = self.fill_order(order.order_id, market_price or signal.entry, signal=signal)
        return self.trade_alert(fill.ticker, "TRADE_ENTERED")

    def trade_alert(self, ticker: str, event_type: str) -> dict:
        open_trade = next((t for t in reversed(self.trades) if t.ticker == ticker and t.status == "OPEN"), None)
        alert = {
            "event_type": event_type,
            "ticker": ticker,
            "created_at": now_iso(),
            "auto_close_seconds": 60,
            "message": f"{ticker} paper trade entered" if event_type == "TRADE_ENTERED" else f"{ticker} paper trade updated",
            "trade": open_trade.to_dict() if open_trade else None,
        }
        self.alerts.append(alert)
        return alert

    def place_order(self, ticker: str, side: Side, qty: int, order_type: str = "MARKET", price: Optional[float] = None, stop: Optional[float] = None, target: Optional[float] = None) -> PaperOrder:
        if qty <= 0:
            raise ValueError("Quantity must be greater than zero.")
        order = PaperOrder(str(uuid4()), ticker.upper(), side, qty, order_type, price, stop, target, now_iso())
        self.orders[order.order_id] = order
        return order

    def fill_order(self, order_id: str, market_price: float, signal: Optional[TradeSignal] = None, exit_reason: Optional[str] = None) -> PaperFill:
        order = self.orders[order_id]
        if order.status != "OPEN":
            raise ValueError("Order is not open.")
        fill_price, slippage = self.slippage_adjusted_price(order.side, market_price)
        gross = fill_price * order.qty
        brokerage = self.brokerage(gross)
        timestamp = now_iso()

        if order.side == Side.BUY:
            total_cost = gross + brokerage
            if total_cost > self.cash:
                raise RuntimeError("Not enough paper cash to fill order.")
            self.cash -= total_cost
            existing = self.positions.get(order.ticker)
            if existing:
                combined_qty = existing.qty + order.qty
                existing.avg_price = ((existing.avg_price * existing.qty) + gross) / combined_qty
                existing.qty = combined_qty
                existing.stop = order.stop or existing.stop
                existing.target = order.target or existing.target
            else:
                self.positions[order.ticker] = PaperPosition(order.ticker, order.qty, fill_price, order.stop, order.target, timestamp)

            self.trades.append(PaperTrade(
                trade_id=str(uuid4()),
                ticker=order.ticker,
                side=order.side,
                qty=order.qty,
                entry_price=round(fill_price, 4),
                entry_time=timestamp,
                stop=order.stop,
                target=order.target,
                setup=signal.setup if signal else "manual",
                score=signal.score if signal else 0.0,
                brokerage=round(brokerage, 2),
                slippage=round(slippage, 4),
            ))
        else:
            pos = self.positions.get(order.ticker)
            if not pos or pos.qty < order.qty:
                raise RuntimeError("Cannot sell more than the current paper position.")
            self.cash += gross - brokerage
            self._close_trade_lots(order.ticker, order.qty, fill_price, brokerage, slippage, timestamp, exit_reason or "Manual exit")
            pos.qty -= order.qty
            if pos.qty == 0:
                del self.positions[order.ticker]

        order.status = "FILLED"
        fill = PaperFill(str(uuid4()), order.order_id, order.ticker, order.side, order.qty, round(fill_price, 4), round(brokerage, 2), round(slippage, 4), timestamp)
        self.fills.append(fill)
        return fill

    def _close_trade_lots(self, ticker: str, qty_to_close: int, exit_price: float, brokerage: float, slippage: float, exit_time: str, exit_reason: str) -> None:
        remaining = qty_to_close
        open_trades = [t for t in self.trades if t.ticker == ticker and t.status == "OPEN"]
        for trade in open_trades:
            if remaining <= 0:
                break
            close_qty = min(trade.qty, remaining)
            # This paper engine keeps one trade row per entry. For partial exits,
            # the first implementation marks the row closed when its full qty exits.
            if close_qty < trade.qty:
                trade.qty -= close_qty
                partial = PaperTrade(
                    trade_id=str(uuid4()), ticker=trade.ticker, side=trade.side, qty=close_qty,
                    entry_price=trade.entry_price, entry_time=trade.entry_time, stop=trade.stop,
                    target=trade.target, setup=trade.setup, score=trade.score,
                )
                self.trades.append(partial)
                trade = partial

            gross_pnl = (exit_price - trade.entry_price) * close_qty
            entry_brokerage = trade.brokerage
            total_brokerage = entry_brokerage + brokerage
            net_pnl = gross_pnl - total_brokerage
            initial_risk = max(trade.entry_price - (trade.stop or trade.entry_price), 0) * close_qty
            r_multiple = net_pnl / initial_risk if initial_risk else 0.0
            trade.status = "CLOSED"
            trade.exit_price = round(exit_price, 4)
            trade.exit_time = exit_time
            trade.exit_reason = exit_reason
            trade.gross_pnl = round(gross_pnl, 2)
            trade.net_pnl = round(net_pnl, 2)
            trade.brokerage = round(total_brokerage, 2)
            trade.slippage = round(trade.slippage + slippage, 4)
            trade.r_multiple = round(r_multiple, 2)
            trade.result = "WIN" if net_pnl > 0 else "LOSS" if net_pnl < 0 else "BREAKEVEN"
            self.closed_pnl.append(net_pnl)
            remaining -= close_qty

    def close_position(self, ticker: str, market_price: float, reason: str = "Manual exit") -> PaperFill:
        ticker = ticker.upper()
        pos = self.positions.get(ticker)
        if not pos:
            raise RuntimeError(f"No open paper position for {ticker}.")
        order = self.place_order(ticker, Side.SELL, pos.qty, "MARKET", market_price, pos.stop, pos.target)
        return self.fill_order(order.order_id, market_price, exit_reason=reason)

    def process_stops_targets(self, last_prices: Dict[str, float]) -> List[dict]:
        """Close positions when the supplied last price hits stop or target."""
        events = []
        for ticker, price in list(last_prices.items()):
            pos = self.positions.get(ticker)
            if not pos:
                continue
            if pos.stop is not None and price <= pos.stop:
                fill = self.close_position(ticker, price, "Stop hit")
                events.append({"event_type": "TRADE_EXITED", "ticker": ticker, "reason": "Stop hit", "fill": fill.to_dict()})
            elif pos.target is not None and price >= pos.target:
                fill = self.close_position(ticker, price, "Target hit")
                events.append({"event_type": "TRADE_EXITED", "ticker": ticker, "reason": "Target hit", "fill": fill.to_dict()})
        self.alerts.extend(events)
        return events

    def trade_journal(self) -> List[dict]:
        return [t.to_dict() for t in self.trades]

    def stats(self) -> Dict[str, float | int]:
        closed = [t for t in self.trades if t.status == "CLOSED"]
        wins = [t for t in closed if t.result == "WIN"]
        losses = [t for t in closed if t.result == "LOSS"]
        net = sum(t.net_pnl for t in closed)
        gross_win = sum(t.net_pnl for t in wins)
        gross_loss = abs(sum(t.net_pnl for t in losses))
        return {
            "starting_cash": round(self.starting_cash, 2),
            "cash": round(self.cash, 2),
            "open_trades": len([t for t in self.trades if t.status == "OPEN"]),
            "closed_trades": len(closed),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate_pct": round((len(wins) / len(closed) * 100) if closed else 0, 2),
            "net_pnl": round(net, 2),
            "profit_factor": round((gross_win / gross_loss) if gross_loss else 0, 2),
            "avg_r": round((sum(t.r_multiple for t in closed) / len(closed)) if closed else 0, 2),
            "consecutive_losses": self.consecutive_losses(),
        }

    def mark_to_market(self, last_prices: Dict[str, float]) -> Dict[str, float]:
        return {
            "cash": round(self.cash, 2),
            "equity": round(self.equity(last_prices), 2),
            "starting_cash": round(self.starting_cash, 2),
            "open_positions": len(self.positions),
            "open_risk": round(self.risk.total_open_risk(self.positions.values(), last_prices), 2),
            "consecutive_losses": self.consecutive_losses(),
            "stats": self.stats(),
            "recent_alerts": self.alerts[-10:],
            "cost_model": {
                "broker_name": self.config.broker_name,
                "brokerage_min": self.config.brokerage_min,
                "brokerage_bps": self.config.brokerage_bps,
                "slippage_bps": self.config.slippage_bps,
                "market_data_monthly_cost": self.config.market_data_monthly_cost,
            },
        }

    def save(self, path: str | Path) -> None:
        data = {
            "name": self.name,
            "starting_cash": self.starting_cash,
            "cash": self.cash,
            "positions": {k: asdict(v) for k, v in self.positions.items()},
            "orders": {k: v.to_dict() for k, v in self.orders.items()},
            "fills": [f.to_dict() for f in self.fills],
            "trades": [t.to_dict() for t in self.trades],
            "closed_pnl": self.closed_pnl,
            "alerts": self.alerts,
        }
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2))

    @classmethod
    def load(cls, path: str | Path, config: TradingConfig = DEFAULT_CONFIG) -> "PaperAccount":
        data = json.loads(Path(path).read_text())
        account = cls(data["name"], data.get("starting_cash", config.starting_cash), config)
        account.cash = data["cash"]
        account.positions = {k: PaperPosition(**v) for k, v in data.get("positions", {}).items()}
        account.closed_pnl = data.get("closed_pnl", [])
        account.alerts = data.get("alerts", [])
        for oid, raw in data.get("orders", {}).items():
            raw["side"] = Side(raw["side"])
            account.orders[oid] = PaperOrder(**raw)
        for raw in data.get("fills", []):
            raw["side"] = Side(raw["side"])
            account.fills.append(PaperFill(**raw))
        for raw in data.get("trades", []):
            raw["side"] = Side(raw["side"])
            account.trades.append(PaperTrade(**raw))
        return account
