const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadServer } = require('./helpers.cjs');

test('scan observations keep their first recorded features and include rejected signals', t => {
  const { run } = loadServer(t);
  const result = run(`(() => {
    const signals = [{symbol:'BHP.AX',price:10,score:40,setup:'watch',priceAsOf:'2026-11-05',paperRules:{allowed:false}}];
    recordObservations(signals, '2026-11-06T00:00:00Z');
    signals[0].score = 95;
    recordObservations(signals, '2026-11-06T01:00:00Z');
    return observationStore.read();
  })()`);
  assert.equal(result.length, 1);
  assert.equal(result[0].score, 40);
  assert.equal(result[0].allowed, false);
});

test('learning outcomes only use completed sessions after the original observation', async t => {
  const { run } = loadServer(t);
  run(`recordObservations([{symbol:'BHP.AX',price:10,score:90,setup:'swing',priceAsOf:'2026-11-01'}], '2026-11-06T00:00:00Z');
    getBars = async () => ({bars: Array.from({length:12}, (_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),open:10,high:11,low:9,close:11}))});`);
  await run(`evaluateObservations('2026-11-12T02:00:00Z')`);
  const item = run('observationStore.read()[0]');
  assert.equal(item.outcomes['5'].entryDate, '2026-11-07');
  assert.equal(item.outcomes['5'].exitDate, '2026-11-11');
  assert.equal(item.outcomes['10'], undefined);
  assert.ok(item.outcomes['5'].netReturnPct < 10);
});

test('learning leaves an unmatured signal pending and does not invent results', async t => {
  const { run } = loadServer(t);
  run(`recordObservations([{symbol:'BHP.AX',price:10,score:90,priceAsOf:'2026-11-06'}], '2026-11-06T00:00:00Z');
    getBars = async () => ({bars: [{date:'2026-11-06',open:10,close:11}]});`);
  await run(`evaluateObservations('2026-11-07T00:00:00Z')`);
  const report = run('learningReport()');
  assert.equal(report.observations, 1);
  assert.equal(report.completed10Session, 0);
  assert.equal(report.comparison.status, 'insufficient_evidence');
});

test('trade storage retains last good revision and refuses an interrupted writer', t => {
  const { run, directory } = loadServer(t);
  run(`tradeStore.update(rows => rows.push({id:'one',symbol:'BHP.AX',status:'open',entry:10,shares:50}));
       tradeStore.update(rows => rows[0].notes = 'updated');`);
  const filename = path.join(directory, 'data/paper-trades.json');
  assert.equal(JSON.parse(fs.readFileSync(filename + '.backup'))[0].notes, undefined);
  fs.writeFileSync(filename + '.lock', 'interrupted');
  assert.throws(() => run(`tradeStore.update(rows => rows.length = 0)`), /busy|writer/i);
  assert.equal(JSON.parse(fs.readFileSync(filename))[0].notes, 'updated');
});

test('missing current history with a backup is a visible recovery condition', t => {
  const { run, directory } = loadServer(t);
  fs.mkdirSync(path.join(directory, 'data'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'data/paper-trades.json.backup'), '[]');
  assert.throws(() => run('readTrades()'), /restore|history/i);
});

test('outcome update skips price requests when no later completed session is possible', async t => {
  const { run } = loadServer(t);
  run(`recordObservations([{symbol:'BHP.AX',price:10,score:90,priceAsOf:'2026-11-06'}], '2026-11-06T00:00:00Z');
    getBars=async()=>{throw new Error('should not request today');};`);
  const report=await run(`evaluateObservations('2026-11-06T03:00:00Z')`);
  assert.equal(report.errors.length,0);
});

test('chronological comparison purges training outcomes that overlap the later test period', t => {
  const {run}=loadServer(t);
  const report=run(`(() => {
    const date=i=>new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10);
    const observations=Array.from({length:40},(_,day)=>Array.from({length:6},(_,stock)=>({
      strategyVersion:VERSION,observationDate:date(day),firstObservedAt:date(day)+'T00:00:00Z',
      score:stock<3?90:70,setup:'test',outcomes:{10:{exitDate:date(day+10),netReturnPct:1}}
    }))).flat();
    return learning.buildReport(observations,VERSION);
  })()`);
  assert.equal(report.comparison.status,'comparison_available');
  assert.equal(report.comparison.splitDate,'2026-01-25');
  assert.equal(report.comparison.training.all.count,84);
  assert.equal(report.comparison.heldOut.all.count,96);
  assert.equal(report.automaticRuleChanges,false);
});
