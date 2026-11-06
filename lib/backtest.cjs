function simulatePortfolio(loaded, params, { analyze, qualifies, sizePosition, minRiskReward }) {
  const round = value => Math.round(value * 10000) / 10000;
  const slip = params.slippageBps / 10000;
  const lookup = new Map(loaded.map(item => [item.symbol, new Map(item.bars.map((bar, index) => [bar.date, { bar, index }]))]));
  const dates = [...new Set(loaded.flatMap(item => item.bars.map(bar => bar.date)))].sort();
  const open = [];
  const trades = [];
  const skipped = [];
  const pending = new Map();
  const equityCurve = [];
  let cash = params.accountSize;

  function close(position, price, reason, date, index) {
    const exit = price * (1 - slip);
    const grossProceeds = exit * position.shares;
    const totalBrokerFees = position.entryBrokerFee + params.exitBrokerFee;
    const grossPnl = grossProceeds - position.tradeValue;
    cash += grossProceeds - params.exitBrokerFee;
    trades.push({ ...position, exitDate: date, exit: round(exit), grossProceeds: round(grossProceeds),
      netProceeds: round(grossProceeds - params.exitBrokerFee), grossPnl: round(grossPnl),
      netPnl: round(grossPnl - totalBrokerFees), pnl: round(grossPnl - totalBrokerFees), totalBrokerFees,
      exitBrokerFee: params.exitBrokerFee, pnlPct: round(100 * (grossPnl - totalBrokerFees) / position.tradeValue),
      holdDays: index - position.entryIndex, exitReason: reason });
    open.splice(open.indexOf(position), 1);
  }

  for (const date of dates) {
    // Existing positions that gap through a stop cannot fill at yesterday's stop.
    for (const position of [...open]) {
      const row = lookup.get(position.symbol).get(date);
      if (!row) continue;
      if (row.bar.open <= position.stop) close(position, row.bar.open, 'Gap below stop', date, row.index);
      else if (row.index - position.entryIndex >= params.minHoldDays && row.bar.open >= position.target) {
        close(position, row.bar.open, 'Gap above target', date, row.index);
      }
    }

    // Orders use only the preceding signal and this session's open. Cash is not
    // reserved or marked using a future price on the original signal date.
    const due = [...pending.values()].filter(order => lookup.get(order.symbol).has(date));
    due.sort((a, b) => b.signal.score - a.signal.score || a.symbol.localeCompare(b.symbol));
    let entries = 0;
    for (const order of due) {
      pending.delete(order.symbol);
      if (entries >= params.maxEntriesPerDay || open.length >= params.maxOpenTrades || open.some(p => p.symbol === order.symbol)) continue;
      const row = lookup.get(order.symbol).get(date);
      const entry = row.bar.open * (1 + slip);
      const stop = Number(order.signal.stopLoss);
      const target = Number(order.signal.target1);
      const rr = (target - entry) / (entry - stop);
      if (!(stop > 0 && stop < entry && entry < target && rr >= minRiskReward)) {
        skipped.push({date, symbol: order.symbol, reason: 'Opening gap invalidated entry, stop, target or risk/reward.'});
        continue;
      }
      // Mark other positions at their opens, never at closes not yet observed.
      const currentEquity = cash + open.reduce((sum, p) => sum + p.shares * (lookup.get(p.symbol).get(date)?.bar.open ?? p.lastPrice), 0);
      const size = sizePosition({ entry, stop, cash, currentEquity, params });
      if (!size) { skipped.push({date, symbol: order.symbol, reason: 'Cash, risk including fees, or trade-value limits.'}); continue; }
      cash -= size.cashCommitted;
      open.push({ ...size, symbol: order.symbol, entryDate: date, signalDate: order.signalDate,
        entryIndex: row.index, entry, stop, target, lastPrice: entry, entryScore: order.signal.score, riskReward: round(rr) });
      entries++;
    }

    for (const position of [...open]) {
      const row = lookup.get(position.symbol).get(date);
      if (!row) continue;
      const held = row.index - position.entryIndex;
      // Daily OHLC cannot establish the path when both levels are touched.
      if (row.bar.low <= position.stop) close(position, position.stop, 'Stop hit', date, row.index);
      else if (held >= params.minHoldDays && row.bar.high >= position.target) close(position, position.target, 'Target hit after minimum hold', date, row.index);
      else if (held >= params.maxHoldDays) close(position, row.bar.close, 'Max hold reached', date, row.index);
      else if (row.index === loaded.find(item => item.symbol === position.symbol).bars.length - 1) {
        close(position, row.bar.close, 'Closed at end of backtest', date, row.index);
      }
      else position.lastPrice = row.bar.close;
    }

    for (const item of loaded) {
      const row = lookup.get(item.symbol).get(date);
      if (!row || row.index < 230 || row.index >= item.bars.length - 1 || open.some(p => p.symbol === item.symbol)) continue;
      const signal = analyze(item.symbol, item.bars.slice(0, row.index + 1), {market: 'Neutral'}, item.source);
      if (qualifies(signal) && signal.paperRules?.allowed) pending.set(item.symbol, { symbol: item.symbol, signal, signalDate: date });
    }
    equityCurve.push({date, equity: round(cash + open.reduce((sum, p) => sum + p.shares * p.lastPrice, 0))});
  }

  return { trades, skipped, equityCurve };
}

module.exports = { simulatePortfolio };
