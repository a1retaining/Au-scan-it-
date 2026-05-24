# Hedge Fund Grade Upgrade

This project is still a retail-safe paper trading system, not a live institutional execution platform. The v15 upgrade makes the architecture think more like a professional desk.

## Added

- Institutional readiness endpoint: `GET /institutional-readiness`
- Data quality endpoint: `GET /data-quality/{ticker}`
- Audit trail endpoint: `GET /audit`
- Pre-trade risk endpoint: `POST /risk/pretrade`
- Append-only JSONL audit log: `outputs/audit_log.jsonl`
- Frontend Institutional Risk Desk panel
- Selected ticker data-quality panel
- Risk-book view: signals, ready/armed, blocked, average score, top sector
- Live trading remains locked by design

## Why live trading is still locked

A hedge fund would not allow live execution until these are complete:

1. Licensed market data with reliability SLA.
2. Survivorship-bias-free historical database including delisted names.
3. Corporate actions adjustment.
4. Announcement, trading halt, earnings, dividend and capital raising feeds.
5. Independent backtest, walk-forward and paper account verification.
6. Full audit trail for every signal, decision, paper trade and override.
7. Human approval and risk limits before broker connectivity.

## New API endpoints

```text
GET  /institutional-readiness
GET  /data-quality/{ticker}
GET  /audit
POST /risk/pretrade
```

## Institutional rule

The app can scan, explain, alert and paper trade. It must not execute real trades until the readiness gates pass and a broker module is intentionally connected.
