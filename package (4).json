from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

SYDNEY_TZ = ZoneInfo("Australia/Sydney")
ASX_OPEN = time(10, 0)
ASX_CLOSE = time(16, 0)

# Minimal known recurring/full-day holidays are deliberately not hard coded here.
# For production-grade holiday accuracy connect an exchange calendar provider or
# maintain the ASX calendar CSV in data/calendar/asx_holidays.csv.

@dataclass(frozen=True)
class MarketClock:
    timezone: str
    now_local: str
    session: str
    is_open: bool
    next_open: str
    next_close: str
    seconds_to_open: int
    seconds_to_close: int
    message: str


def _next_weekday_open(now: datetime) -> datetime:
    candidate = now.replace(hour=ASX_OPEN.hour, minute=0, second=0, microsecond=0)
    if now.weekday() >= 5 or now.time() >= ASX_CLOSE:
        candidate = candidate + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate = candidate + timedelta(days=1)
    return candidate


def get_market_clock(now: datetime | None = None) -> dict:
    now = now.astimezone(SYDNEY_TZ) if now else datetime.now(SYDNEY_TZ)
    open_dt = now.replace(hour=ASX_OPEN.hour, minute=0, second=0, microsecond=0)
    close_dt = now.replace(hour=ASX_CLOSE.hour, minute=0, second=0, microsecond=0)

    weekday = now.weekday() < 5
    is_open = weekday and open_dt <= now < close_dt

    if is_open:
        session = "OPEN"
        next_open = open_dt
        next_close = close_dt
        message = "ASX regular session is open. Paper scanning and alerts can run."
    else:
        session = "CLOSED"
        next_open = _next_weekday_open(now)
        next_close = next_open.replace(hour=ASX_CLOSE.hour)
        message = "ASX is closed. No new paper entries should be treated as live market signals."

    clock = MarketClock(
        timezone="Australia/Sydney",
        now_local=now.isoformat(),
        session=session,
        is_open=is_open,
        next_open=next_open.isoformat(),
        next_close=next_close.isoformat(),
        seconds_to_open=max(0, int((next_open - now).total_seconds())),
        seconds_to_close=max(0, int((next_close - now).total_seconds())),
        message=message,
    )
    return asdict(clock)
