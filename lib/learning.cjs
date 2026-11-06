const { createHash } = require('node:crypto');
const HORIZONS = [5, 10, 20];
const round = x => Math.round(x * 10000) / 10000;

function sydneyDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function makeObservation(signal, version, observedAt, costModel) {
  const observationDate = sydneyDate(observedAt);
  const marketDate = String(signal.priceAsOf || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(marketDate)) return null;
  if (!Number.isFinite(signal.price) || signal.price <= 0 || !Number.isFinite(signal.score)) return null;
  const key = [version, signal.symbol, observationDate].join('|');
  return {
    id: createHash('sha256').update(key).digest('hex'), strategyVersion: version,
    symbol: signal.symbol, firstObservedAt: observedAt, observationDate, marketDate,
    cutoffDate: marketDate > observationDate ? marketDate : observationDate,
    price: signal.price, score: signal.score, setup: signal.setup || 'watch',
    allowed: !!signal.paperRules?.allowed, decision: signal.decision || '',
    source: signal.source || 'unspecified',
    features: {scoreParts: signal.scoreParts || [], indicators: signal.indicators || {},
      stop: signal.stopLoss ?? null, target: signal.target1 ?? null, marketRegime: signal.marketRegime || 'unknown'},
    costModel: {...costModel}, outcomes: {}
  };
}

function settleObservation(observation, bars, asOf) {
  const today = sydneyDate(asOf);
  // Exclude today's potentially incomplete daily candle even after market close.
  const future = bars.filter(b => b.date > observation.cutoffDate && b.date < today)
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!future.length) return {};
  const cost = observation.costModel;
  const slip = cost.slippageBps / 10000;
  const entry = Number(future[0].open) * (1 + slip);
  const shares = Math.floor((cost.budget - cost.entryFee) / entry);
  if (!(entry > 0 && Number.isFinite(entry) && shares > 0)) return {};
  const invested = shares * entry + cost.entryFee;
  const outcomes = {};
  for (const horizon of HORIZONS) {
    if (observation.outcomes[horizon] || future.length < horizon) continue;
    const exitBar = future[horizon - 1];
    const exit = Number(exitBar.close) * (1 - slip);
    if (!(exit > 0 && Number.isFinite(exit))) continue;
    const netPnl = shares * (exit - entry) - cost.entryFee - cost.exitFee;
    outcomes[horizon] = { entryDate: future[0].date, exitDate: exitBar.date, entry: round(entry), exit: round(exit),
      shares, netPnl: round(netPnl), netReturnPct: round(100 * netPnl / invested), evaluatedAt: asOf };
  }
  return outcomes;
}

function summary(rows) {
  if (!rows.length) return {count: 0, meanNetReturnPct: null, winRatePct: null};
  const returns = rows.map(row => row.outcomes[10].netReturnPct);
  return {count: rows.length, meanNetReturnPct: round(returns.reduce((a,b) => a+b, 0) / rows.length),
    winRatePct: round(100 * returns.filter(x => x > 0).length / rows.length)};
}

function buildReport(observations, version) {
  const rows = observations.filter(row => row.strategyVersion === version);
  const complete = rows.filter(row => row.outcomes[10]);
  const dates = [...new Set(complete.map(row => row.observationDate))].sort();
  const split = dates[Math.floor(dates.length * 0.6)];
  // Purge training examples whose measured outcome reaches the test period.
  const train = complete.filter(row => row.observationDate < split && row.outcomes[10].exitDate < split);
  const test = complete.filter(row => row.observationDate >= split);
  const trainHigh = train.filter(row => row.score >= 85);
  const testHigh = test.filter(row => row.score >= 85);
  const enough = dates.length >= 20 && trainHigh.length >= 30 && testHigh.length >= 30 &&
    train.filter(row => row.score < 85).length >= 30 && test.filter(row => row.score < 85).length >= 30;
  const groups = {};
  for (const row of complete) {
    const band = row.score >= 85 ? '85–100' : row.score >= 80 ? '80–84' : row.score >= 60 ? '60–79' : 'Below 60';
    const key = row.setup + ' | ' + band;
    (groups[key] ||= []).push(row);
  }
  return {
    strategyVersion: version, observations: rows.length, completed10Session: complete.length,
    pending10Session: rows.length - complete.length, observationDates: dates.length,
    observedFrom: rows.length ? rows.map(r => r.firstObservedAt).sort()[0] : null,
    outcomesByHorizon: Object.fromEntries(HORIZONS.map(h => [h, rows.filter(row => row.outcomes[h]).length])),
    bySetupAndScore: Object.entries(groups).map(([group, items]) => ({group, ...summary(items)})),
    comparison: {
      status: enough ? 'comparison_available' : 'insufficient_evidence', splitDate: split || null,
      training: {all: summary(train), score85Plus: summary(trainHigh), below85: summary(train.filter(row => row.score < 85))},
      heldOut: {all: summary(test), score85Plus: summary(testHigh), below85: summary(test.filter(row => row.score < 85))},
      message: enough ? 'Compare the untouched test period before proposing a rule change. No rules have been changed.' :
        'Need 20 completed observation dates, plus 30 observations above and below score 85 in both purged training and later test periods.'
    },
    method: 'First signal per symbol per Sydney day. Hypothetical next-session open to 5/10/20-session close, after captured brokerage and slippage. These are diagnostic forward returns, not stop/target trade results.',
    limitations: ['Signals overlap and share market exposure; counts are not independent trials.',
      'The scanned universe is selected, not a market-wide benchmark. Rejected signals are included.',
      'Unadjusted public data may be delayed or affected by corporate actions and missing/delisted symbols.',
      'Chronological comparisons are descriptive and do not establish statistical confidence or future profitability.'],
    automaticRuleChanges: false
  };
}

module.exports = { makeObservation, settleObservation, buildReport, sydneyDate };
