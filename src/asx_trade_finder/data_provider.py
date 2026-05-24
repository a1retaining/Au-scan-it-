from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, Optional

import pandas as pd


class CSVDataProvider:
    """Simple local data provider for GitHub/demo use.

    Expected file per ticker: data/sample/prices/{TICKER}.csv
    Columns: date, open, high, low, close, volume, optional spread_pct
    """

    def __init__(self, root: str | Path = "data/sample/prices"):
        self.root = Path(root)

    def load_prices(self, ticker: str) -> pd.DataFrame:
        path = self.root / f"{ticker.upper()}.csv"
        if not path.exists():
            raise FileNotFoundError(f"Missing price file: {path}")
        df = pd.read_csv(path)
        df.columns = [c.lower() for c in df.columns]
        required = {"date", "open", "high", "low", "close", "volume"}
        missing = required.difference(df.columns)
        if missing:
            raise ValueError(f"{path} missing required columns: {sorted(missing)}")
        df["date"] = pd.to_datetime(df["date"])
        return df.sort_values("date").reset_index(drop=True)

    def load_watchlist(self, watchlist_path: str | Path) -> pd.DataFrame:
        df = pd.read_csv(watchlist_path)
        required = {"ticker", "name", "sector"}
        missing = required.difference(set(df.columns))
        if missing:
            raise ValueError(f"Watchlist missing required columns: {sorted(missing)}")
        return df
