from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

from asx_trade_finder.api import app
from asx_trade_finder.data_quality import assess_price_data
from asx_trade_finder.institutional import institutional_readiness, signal_risk_book


def test_institutional_readiness_shape():
    report = institutional_readiness("csv", "10y", 45, "closed_market_review")
    assert report["live_trading_allowed"] is False
    assert report["score"] > 0
    assert any(item["gate"] == "Audit trail" for item in report["items"])


def test_signal_risk_book_counts_ready_and_blocked():
    book = signal_risk_book([
        {"ticker": "CBA", "sector": "Banks", "score": 90, "status": "READY"},
        {"ticker": "XYZ", "sector": "Mining", "score": 20, "status": "BLOCKED"},
    ])
    assert book["count"] == 2
    assert book["ready"] == 1
    assert book["blocked"] == 1


def test_data_quality_report_passes_basic_ohlcv():
    df = pd.DataFrame({
        "date": pd.date_range("2026-01-01", periods=60),
        "open": [1.0] * 60,
        "high": [1.1] * 60,
        "low": [0.9] * 60,
        "close": [1.0] * 60,
        "volume": [1000] * 60,
    })
    report = assess_price_data("CBA", df)
    assert report.has_required_columns is True
    assert report.duplicate_date_rows == 0


def test_api_institutional_endpoints(tmp_path, monkeypatch):
    monkeypatch.setenv("ASX_AUDIT_LOG", str(tmp_path / "audit.jsonl"))
    client = TestClient(app)
    r = client.get("/institutional-readiness")
    assert r.status_code == 200
    assert "items" in r.json()
    r2 = client.get("/audit")
    assert r2.status_code == 200
    assert "events" in r2.json()
