from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List

import pandas as pd

from .data_provider import CSVDataProvider
from .scoring import ASXSignalScorer
from .config import DEFAULT_CONFIG, TradingConfig
from .costs import CostModel


def run_simple_backtest(watchlist_path: str | Path, price_root: str | Path = "data/sample/prices", initial_equity: float = 5_000, config: TradingConfig = DEFAULT_CONFIG) -> pd.DataFrame:
    """Simple demonstration backtest.

    It is deliberately conservative and transparent. Production use should add
    survivorship-bias controls, delisted symbols, walk-forward splits, and more
    detailed execution modelling.
    """
    provider = CSVDataProvider(price_root)
    costs = CostModel(config)
    watchlist = provider.load_watchlist(watchlist_path)
    scorer = ASXSignalScorer()
    rows: List[dict] = []
    for item in watchlist.itertuples(index=False):
        prices = provider.load_prices(str(item.ticker))
        if len(prices) < 90:
            continue
        signal = scorer.score_dataframe(str(item.ticker), str(item.name), str(item.sector), prices.iloc[:-10])
        future = prices.iloc[-10:]
        if signal.entry <= 0:
            continue
        hit_target = (future["high"] >= signal.target).any()
        hit_stop = (future["low"] <= signal.stop).any()
        if hit_target and not hit_stop:
            exit_price = signal.target
            exit_reason = "Target hit"
        elif hit_stop and not hit_target:
            exit_price = signal.stop
            exit_reason = "Stop hit"
        elif hit_target and hit_stop:
            exit_price = signal.stop  # conservative path assumption
            exit_reason = "Stop hit before target, conservative"
        else:
            exit_price = float(future.iloc[-1]["close"])
            exit_reason = "Timed exit"

        risk_per_share = max(signal.entry - signal.stop, 0.01)
        qty = max(int((initial_equity * config.max_risk_per_trade_pct) // risk_per_share), 1)
        cost = costs.round_trip(qty, signal.entry, exit_price)
        gross_pnl = round((cost.exit_value - cost.entry_value), 2)
        net_pnl = round(gross_pnl - cost.total_brokerage, 2)
        result_r = net_pnl / max(risk_per_share * qty, 0.01)
        rows.append({
            "ticker": signal.ticker,
            "setup": signal.setup,
            "score": signal.score,
            "grade": signal.grade,
            "status": signal.status.value,
            "entry": signal.entry,
            "stop": signal.stop,
            "target": signal.target,
            "exit_price": round(exit_price, 4),
            "exit_reason": exit_reason,
            "qty": qty,
            "gross_pnl": gross_pnl,
            "entry_brokerage": cost.entry_brokerage,
            "exit_brokerage": cost.exit_brokerage,
            "total_brokerage": cost.total_brokerage,
            "total_slippage": cost.total_slippage,
            "total_costs": cost.total_costs,
            "net_pnl": net_pnl,
            "result_r": round(result_r, 2),
        })
    return pd.DataFrame(rows)


def summarise_backtest(results: pd.DataFrame) -> Dict[str, float]:
    if results.empty:
        return {"trades": 0, "win_rate": 0, "profit_factor": 0, "expectancy_r": 0}
    wins = results[results["result_r"] > 0]["result_r"]
    losses = results[results["result_r"] < 0]["result_r"]
    gross_win = wins.sum()
    gross_loss = abs(losses.sum())
    return {
        "trades": int(len(results)),
        "win_rate": round(float((results["result_r"] > 0).mean()), 3),
        "profit_factor": round(float(gross_win / gross_loss), 3) if gross_loss else 0,
        "expectancy_r": round(float(results["result_r"].mean()), 3),
        "net_pnl": round(float(results.get("net_pnl", pd.Series(dtype=float)).sum()), 2),
        "total_costs": round(float(results.get("total_costs", pd.Series(dtype=float)).sum()), 2),
        "avg_win_r": round(float(wins.mean()), 3) if len(wins) else 0,
        "avg_loss_r": round(float(losses.mean()), 3) if len(losses) else 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run simple ASX demonstration backtest.")
    parser.add_argument("--input", default="data/sample/sample_watchlist.csv")
    parser.add_argument("--prices", default="data/sample/prices")
    parser.add_argument("--output", default="outputs/backtest_results.csv")
    args = parser.parse_args()
    results = run_simple_backtest(args.input, args.prices)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    results.to_csv(args.output, index=False)
    print(results.to_string(index=False))
    print(summarise_backtest(results))
    print(f"Saved: {args.output}")


if __name__ == "__main__":
    main()
