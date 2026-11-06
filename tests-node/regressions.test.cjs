const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadServer, marketFixture } = require('./helpers.cjs');

test('daily ASX candles use the Sydney session date during daylight saving', t => {
  const { run } = loadServer(t);
  assert.equal(run(`safeDate(Date.parse('2026-11-05T23:00:00Z') / 1000, '1d')`), '2026-11-06');
});

test('paper equity includes market value and keeps cash distinct from unrealised P/L', t => {
  const { run } = loadServer(t);
  const stats = run(`paperAccountStats([{id:'one',symbol:'BHP.AX',status:'open',side:'long',entry:10,shares:50,stop:9,target:12}], {'BHP.AX': {price:12,asOf:'2026-11-06T00:00:00Z'}})`);
  assert.equal(stats.cashAvailable, 4490.5);
  assert.equal(stats.marketValueOfOpenTrades, 600);
  assert.equal(stats.unrealisedPnl, 100);
  assert.equal(stats.accountEquity, 5090.5);
});

test('missing market prices are labelled as incomplete valuation', t => {
  const { run } = loadServer(t);
  const stats = run(`paperAccountStats([{id:'one',symbol:'BHP.AX',status:'open',entry:10,shares:50,stop:9,target:12}])`);
  assert.equal(stats.valuationComplete, false);
  assert.equal(stats.unpricedOpenTrades, 1);
});

test('corrupt trade history blocks writes instead of becoming an empty account', t => {
  const { run, directory } = loadServer(t);
  fs.mkdirSync(path.join(directory, 'data'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'data/paper-trades.json'), '{broken');
  assert.throws(() => run('readTrades()'), /history|storage|JSON/i);
  assert.equal(fs.readFileSync(path.join(directory, 'data/paper-trades.json'), 'utf8'), '{broken');
});

test('backtest fills a gap below the stop at the opening price', async t => {
  const { run } = loadServer(t);
  run(marketFixture + `fixtureBars[232] = {...fixtureBars[232],open:8,low:7.8,high:8.5,close:8};`);
  const result = await run(`backtestSymbols(['BHP.AX'], fixtureParams)`);
  assert.equal(result.trades[0].exit, 8);
});

test('backtest processes stop on entry day', async t => {
  const { run } = loadServer(t);
  run(marketFixture + `fixtureBars[231] = {...fixtureBars[231],low:8.5};`);
  const result = await run(`backtestSymbols(['BHP.AX'], fixtureParams)`);
  assert.equal(result.trades[0].exitReason, 'Stop hit');
  assert.equal(result.trades[0].holdDays, 0);
});

test('backtest never values tomorrow\'s position on the signal date', async t => {
  const { run } = loadServer(t);
  run(marketFixture + `fixtureBars[231] = {...fixtureBars[231],open:9.8,high:10.5,low:9.5,close:9.8};`);
  const result = await run(`backtestSymbols(['BHP.AX'], fixtureParams)`);
  assert.equal(result.trades.length, 1);
  const signalDay = result.equityCurve.find(p => p.date === run('fixtureBars[230].date'));
  assert.equal(signalDay.equity, 5000);
});

test('risk sizing includes both broker fees', t => {
  const { run } = loadServer(t);
  assert.equal(run('calculateSharesForSignal(10, 9)'), 31);
  const size = run(`calculateBacktestPositionSize({entry:10,stop:9,cash:5000,currentEquity:5000,params:getBacktestParams({query:{}})})`);
  // $500 minimum cannot be met under the $50 risk budget including $19 fees.
  assert.equal(size, null);
});

test('symbols with shorter histories release capital on their reported end date', async t => {
  const { run } = loadServer(t);
  run(marketFixture + `
    getBars = async symbol => ({bars:symbol==='BHP.AX'?fixtureBars.slice(0,233):fixtureBars,source:'test feed'});
    analyzeSymbol = (symbol,bars) => ({symbol,price:10,score:90,riskReward:2,distanceToBuyZonePct:0,
      stopLoss:9,target1:12,paperRules:{allowed:bars.length===(symbol==='BHP.AX'?231:233)}});
    fixtureParams.maxOpenTrades=1;
  `);
  const result = await run(`backtestSymbols(['BHP.AX','CBA.AX'],fixtureParams)`);
  assert.equal(result.trades.length,2);
  const first=result.trades.find(t=>t.symbol==='BHP.AX');
  assert.equal(first.exitDate,run('fixtureBars[232].date'));
  const curve=result.equityCurve.find(p=>p.date===first.exitDate);
  assert.equal(curve.equity,4981);
});
