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


class YFinanceDataProvider:
    """Free delayed Yahoo Finance provider for ASX symbols.

    This gives the app a real-data path for GitHub/Render testing. It is not a
    licensed institutional ASX feed and should be treated as delayed/third-party
    market data. ASX tickers are requested as TICKER.AX.
    """

    def __init__(self, period: str = "10y", interval: str = "1d"):
        self.period = period
        self.interval = interval

    @staticmethod
    def yahoo_symbol(ticker: str) -> str:
        symbol = ticker.upper().strip()
        return symbol if symbol.endswith(".AX") else f"{symbol}.AX"

    def load_prices(self, ticker: str) -> pd.DataFrame:
        try:
            import yfinance as yf
        except Exception as exc:  # pragma: no cover - depends on optional package
            raise RuntimeError("yfinance is not installed. Run: pip install yfinance") from exc

        symbol = self.yahoo_symbol(ticker)
        df = yf.download(symbol, period=self.period, interval=self.interval, auto_adjust=False, progress=False)
        if df is None or df.empty:
            raise FileNotFoundError(f"No Yahoo Finance price data returned for {symbol}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [c[0] for c in df.columns]
        df = df.reset_index()
        rename = {"Date": "date", "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}
        df = df.rename(columns=rename)
        required = ["date", "open", "high", "low", "close", "volume"]
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(f"Yahoo Finance data for {symbol} missing columns: {missing}")
        out = df[required].copy()
        out["date"] = pd.to_datetime(out["date"])
        out = out.dropna(subset=["close"]).sort_values("date").reset_index(drop=True)
        # Yahoo daily data does not provide bid/ask. Use a conservative estimate
        # so the scorer still models spread until a live provider is connected.
        out["spread_pct"] = 0.0025
        return out

    def load_watchlist(self, watchlist_path: str | Path) -> pd.DataFrame:
        return CSVDataProvider().load_watchlist(watchlist_path)


def get_data_provider(kind: str = "csv", price_root: str | Path = "data/sample/prices", period: str = "10y"):
    kind = (kind or "csv").lower().strip()
    if kind in {"yfinance", "yahoo", "real"}:
        return YFinanceDataProvider(period=period)
    return CSVDataProvider(price_root)
