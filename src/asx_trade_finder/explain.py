from __future__ import annotations

from typing import List


def plain_english_signal_summary(ticker: str, status: str, score: float, reasons: List[str], blockers: List[str]) -> str:
    if status == "READY":
        lead = f"{ticker} is marked READY because the setup passes the main trend, sector, liquidity, and risk filters."
    elif status == "ARMED":
        lead = f"{ticker} is ARMED. It is close to a valid trade, but it still needs the trigger to confirm."
    elif status == "WATCH":
        lead = f"{ticker} is on WATCH. It has some good features, but the edge is not strong enough yet."
    else:
        lead = f"{ticker} is BLOCKED. The system is protecting the account from a low-quality setup."

    why = " ".join(reasons[:4]) if reasons else "No positive reasons were recorded."
    blocked = " ".join(blockers[:3]) if blockers else "No hard blockers were recorded."
    return f"{lead} Current score: {score:.0f}/100. Main read: {why} Blockers: {blocked}"
