from __future__ import annotations

from typing import Dict, Tuple, List

import pandas as pd

from .config import TradingConfig, DEFAULT_CONFIG
from .indicators import add_core_indicators
from .models import SignalStatus, TradeSignal


SECTOR_SCORES: Dict[str, float] = {
    "Banks": 82,
    "Financials": 82,
    "Materials": 76,
    "Gold": 72,
    "Energy": 55,
    "Healthcare": 44,
    "Lithium": 39,
    "Consumer": 62,
    "Tech": 66,
    "REITs": 52,
}


class ASXSignalScorer:
    def __init__(self, config: TradingConfig = DEFAULT_CONFIG):
        self.config = config

    def score_dataframe(self, ticker: str, name: str, sector: str, df: pd.DataFrame) -> TradeSignal:
        if len(df) < 60:
            return self._blocked(ticker, name, sector, "Not enough price history")

        data = add_core_indicators(df).dropna(subset=["sma20", "sma50"])
        if data.empty:
            return self._blocked(ticker, name, sector, "Not enough indicator history")

        last = data.iloc[-1]
        prev20_high = data.iloc[-21:-1]["high"].max() if len(data) > 21 else data["high"].max()
        atr = float(last.get("atr14", 0) or 0)
        close = float(last["close"])
        volume_multiple = float(last.get("volume_multiple", 1) or 1)
        avg_daily_value = float(last.get("avg_daily_value20", 0) or 0)
        spread_pct = float(last.get("spread_pct", 0.002) or 0.002)

        reasons: List[str] = []
        blockers: List[str] = []
        risks: List[str] = []

        trend_score = 0.0
        if close > float(last["sma20"]):
            trend_score += 8
            reasons.append("Price is above the 20-day average")
        else:
            risks.append("Price is below the 20-day average")
        if close > float(last["sma50"]):
            trend_score += 8
            reasons.append("Price is above the 50-day average")
        else:
            blockers.append("Price is below the 50-day average")
        if "sma200" in last and pd.notna(last["sma200"]):
            if close > float(last["sma200"]):
                trend_score += 4
                reasons.append("Price is above the 200-day average")
            else:
                blockers.append("Price is below the 200-day average")
        else:
            trend_score += 2
            risks.append("200-day trend is unavailable")

        sector_score = min(SECTOR_SCORES.get(sector, 50), 100) * 0.15
        if SECTOR_SCORES.get(sector, 50) >= 70:
            reasons.append(f"{sector} sector is leading")
        elif SECTOR_SCORES.get(sector, 50) < 45:
            blockers.append(f"{sector} sector is weak")

        volume_score = min(volume_multiple / 1.5, 1) * 10
        if volume_multiple >= 1.5:
            reasons.append("Volume is at least 1.5x normal")
        elif volume_multiple < 1.0:
            risks.append("Volume is below normal")

        breakout_score = 0.0
        setup = "Pullback in uptrend"
        if close >= prev20_high * 0.995:
            breakout_score = 15
            setup = "Momentum breakout"
            reasons.append("Price is pressing against recent resistance")
        elif close >= float(last["sma20"]) and close >= float(last["sma50"]):
            breakout_score = 11
            reasons.append("Pullback is holding above key trend averages")
        else:
            breakout_score = 4

        relative_strength_score = 12
        if data["close"].pct_change(20).iloc[-1] > 0:
            relative_strength_score += 3
            reasons.append("20-day momentum is positive")
        else:
            risks.append("20-day momentum is weak")

        if atr <= 0 or pd.isna(atr):
            atr = close * 0.025
        entry = round(close, 2)
        stop = round(max(close - 1.5 * atr, close * 0.96), 2)
        target = round(close + 3.0 * atr, 2)
        rr = (target - entry) / max(entry - stop, 0.01)
        risk_reward_score = min(rr / 3.0, 1) * 10
        if rr >= self.config.min_risk_reward:
            reasons.append("Risk-to-reward is acceptable")
        else:
            blockers.append("Risk-to-reward is below 2R")

        liquidity_score = 10 if avg_daily_value >= self.config.min_avg_daily_value else 2
        if avg_daily_value >= self.config.min_avg_daily_value:
            reasons.append("Liquidity passes minimum average daily value")
        else:
            blockers.append("Average daily value is too low")
        if spread_pct > self.config.max_spread_pct:
            blockers.append("Spread is too wide")

        score = trend_score + sector_score + volume_score + breakout_score + relative_strength_score + risk_reward_score + liquidity_score
        score = max(0, min(100, score))
        grade = self._grade(score)
        status = self._status(score, blockers)
        confidence = self._confidence(score, len(reasons), len(blockers), volume_multiple)

        return TradeSignal(
            ticker=ticker,
            name=name,
            sector=sector,
            setup=setup,
            score=round(score, 1),
            grade=grade,
            status=status,
            entry=entry,
            stop=stop,
            target=target,
            risk_reward=round(rr, 2),
            volume_multiple=round(volume_multiple, 2),
            avg_daily_value=round(avg_daily_value, 2),
            spread_pct=round(spread_pct, 4),
            reasons=reasons,
            risks=risks,
            blockers=blockers,
            confidence=confidence,
        )

    def _blocked(self, ticker: str, name: str, sector: str, reason: str) -> TradeSignal:
        return TradeSignal(ticker, name, sector, "No valid setup", 0, "D", SignalStatus.BLOCKED, 0, 0, 0, 0, 0, 0, 0, blockers=[reason])

    @staticmethod
    def _grade(score: float) -> str:
        if score >= 90:
            return "A+"
        if score >= 80:
            return "A"
        if score >= 70:
            return "B"
        if score >= 60:
            return "C"
        return "D"

    @staticmethod
    def _status(score: float, blockers: List[str]) -> SignalStatus:
        hard_blockers = [b for b in blockers if "below the 50" in b or "below the 200" in b or "Spread" in b or "Average daily" in b]
        if hard_blockers:
            return SignalStatus.BLOCKED
        if score >= 85:
            return SignalStatus.READY
        if score >= 75:
            return SignalStatus.ARMED
        if score >= 65:
            return SignalStatus.WATCH
        return SignalStatus.BLOCKED

    @staticmethod
    def _confidence(score: float, reason_count: int, blocker_count: int, volume_multiple: float) -> float:
        confidence = score * 0.65 + min(reason_count, 6) * 4 + min(volume_multiple, 2.5) * 4 - blocker_count * 9
        return round(max(0, min(100, confidence)), 1)
