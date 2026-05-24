from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List

import pandas as pd

from .data_provider import CSVDataProvider
from .explain import plain_english_signal_summary
from .scoring import ASXSignalScorer


def scan_watchlist(watchlist_path: str | Path, price_root: str | Path = "data/sample/prices") -> pd.DataFrame:
    provider = CSVDataProvider(price_root)
    watchlist = provider.load_watchlist(watchlist_path)
    scorer = ASXSignalScorer()
    rows: List[dict] = []
    for item in watchlist.itertuples(index=False):
        try:
            prices = provider.load_prices(str(item.ticker))
            signal = scorer.score_dataframe(str(item.ticker), str(item.name), str(item.sector), prices)
        except Exception as exc:
            signal = scorer._blocked(str(item.ticker), str(item.name), str(item.sector), str(exc))
        row = signal.to_dict()
        row["plain_english"] = plain_english_signal_summary(signal.ticker, signal.status.value, signal.score, signal.reasons, signal.blockers)
        rows.append(row)
    return pd.DataFrame(rows).sort_values(["score", "confidence"], ascending=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan ASX watchlist and produce scored trade signals.")
    parser.add_argument("--input", default="data/sample/sample_watchlist.csv")
    parser.add_argument("--prices", default="data/sample/prices")
    parser.add_argument("--output", default="outputs/scanner_output.csv")
    parser.add_argument("--json-output", default="outputs/scanner_output.json")
    args = parser.parse_args()

    output = scan_watchlist(args.input, args.prices)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    output.to_json(args.json_output, orient="records", indent=2)
    print(output[["ticker", "sector", "score", "grade", "status", "risk_reward", "confidence"]].to_string(index=False))
    print(f"Saved CSV: {args.output}")
    print(f"Saved JSON: {args.json_output}")


if __name__ == "__main__":
    main()
