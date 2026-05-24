#!/usr/bin/env python3
"""Ping deployed Render services so they stay warm when using an uptime monitor/cron.

Important: Render free web services can still sleep or run out of free monthly hours.
For true never-sleep behaviour, use a paid Render instance. This script is for
optional keep-warm pings and health monitoring.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.request

URLS = [u.strip() for u in os.getenv("KEEPALIVE_URLS", "").split(",") if u.strip()]
TIMEOUT = int(os.getenv("KEEPALIVE_TIMEOUT", "20"))


def ping(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as response:
            print(f"{url} -> {response.status}")
            return 200 <= response.status < 500
    except Exception as exc:
        print(f"{url} -> ERROR: {exc}", file=sys.stderr)
        return False


def main() -> int:
    if not URLS:
        print("Set KEEPALIVE_URLS to one or more comma-separated URLs, e.g. https://app.onrender.com/keepalive")
        return 2
    ok = True
    for url in URLS:
        ok = ping(url) and ok
        time.sleep(1)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
