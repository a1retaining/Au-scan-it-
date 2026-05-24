# Cost Model

The system must treat trading costs as part of the trade.

## Costs currently modelled

1. **Entry brokerage**
2. **Exit brokerage**
3. **Entry slippage**
4. **Exit slippage**
5. **Round-trip total costs**
6. **Net P/L after brokerage and slippage**
7. **R-multiple after costs**

The default paper account starts at **$5,000** and uses a conservative generic ASX cost profile:

```python
brokerage_min = 9.50
brokerage_bps = 0.0008
slippage_bps = 0.0005
```

That means every backtest and paper trade should be judged on **net result after entry and exit costs**, not gross chart movement.

## Costs not automatically deducted yet

These are tracked as notes or future settings, because they depend on the user, broker, data provider, or account structure:

- Capital gains tax / income tax
- Monthly data feed charges
- Platform subscription fees
- Margin interest
- Short-borrow costs
- FX costs for non-ASX trades
- Failed trade/opportunity costs

Live margin and short selling should stay disabled until the system proves itself in paper testing.
