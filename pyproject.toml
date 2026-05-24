from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Dict

import pandas as pd


@dataclass(frozen=True)
class DataQualityReport:
    ticker: str
    rows: int
    first_date: str
    last_date: str
    stale_days: int
    missing_close_rows: int
    missing_volume_rows: int
    duplicate_date_rows: int
    has_required_columns: bool
    passed: bool
    warnings: list[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def assess_price_data(ticker: str, prices: pd.DataFrame, max_stale_days: int = 7) -> DataQualityReport:
    warnings: list[str] = []
    required = {"date", "open", "high", "low", "close", "volume"}
    has_required = required.issubset(set(prices.columns))
    if not has_required:
        warnings.append("Missing required OHLCV columns.")

    if prices.empty:
        return DataQualityReport(ticker, 0, "", "", 9999, 0, 0, 0, has_required, False, ["No price rows returned."])

    df = prices.copy()
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        first = df["date"].min()
        last = df["date"].max()
    else:
        first = pd.NaT
        last = pd.NaT

    now = pd.Timestamp(datetime.now(timezone.utc)).tz_localize(None)
    last_naive = pd.Timestamp(last).tz_localize(None) if pd.notna(last) else now - pd.Timedelta(days=9999)
    stale_days = max(0, int((now - last_naive).days))

    missing_close = int(df["close"].isna().sum()) if "close" in df.columns else len(df)
    missing_volume = int(df["volume"].isna().sum()) if "volume" in df.columns else len(df)
    duplicates = int(df.duplicated(subset=["date"]).sum()) if "date" in df.columns else 0

    if stale_days > max_stale_days:
        warnings.append(f"Last price row is stale by {stale_days} days.")
    if missing_close:
        warnings.append(f"Missing close values: {missing_close} rows.")
    if missing_volume:
        warnings.append(f"Missing volume values: {missing_volume} rows.")
    if duplicates:
        warnings.append(f"Duplicate dates: {duplicates} rows.")
    if len(df) < 200:
        warnings.append("Less than 200 rows. Trend and backtest confidence is reduced.")

    passed = has_required and not missing_close and not duplicates and len(df) >= 50
    return DataQualityReport(
        ticker=ticker.upper(),
        rows=len(df),
        first_date=str(first.date()) if pd.notna(first) else "",
        last_date=str(last.date()) if pd.notna(last) else "",
        stale_days=stale_days,
        missing_close_rows=missing_close,
        missing_volume_rows=missing_volume,
        duplicate_date_rows=duplicates,
        has_required_columns=has_required,
        passed=passed,
        warnings=warnings,
    )
