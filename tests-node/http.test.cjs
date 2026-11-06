const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadServer } = require('./helpers.cjs');

async function start(t) {
  const loaded = loadServer(t);
  const server = loaded.run('app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {...loaded, base: `http://127.0.0.1:${server.address().port}`};
}

test('HTTP paper workflow saves, values, exports and closes one consistent account', async t => {
  const {run, base} = await start(t);
  run(`getBars = async symbol => ({symbol,interval:'15m',source:'test price provider',bars:[{date:new Date().toISOString(),close:12}]});`);
  const body = {symbol:'BHP',entry:10,shares:60,stop:9.8,target:10.5,score:90};
  const send = () => fetch(base + '/api/paper/open', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const opens = await Promise.all([send(),send()]);
  assert.deepEqual(opens.map(response=>response.status).sort(), [200,400]);
  const response = await fetch(base + '/api/paper/trades');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.trades.length, 1);
  assert.equal(data.account.accountEquity, 5110.5);
  assert.equal(data.trades[0].markPrice, 12);
  const backupResponse = await fetch(base + '/api/backup');
  assert.match(backupResponse.headers.get('content-disposition'), /attachment/);
  assert.equal((await backupResponse.json()).trades.length, 1);
  const closed = await fetch(base + '/api/paper/close', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:data.trades[0].id,exit:11})});
  const closing = await closed.json();
  assert.equal(closing.account.realisedPnl, 41);
  assert.equal(closing.account.cashAvailable, 5041);
  assert.equal((await (await fetch(base + '/api/paper/stats')).json()).stats.accountEquity, 5041);
});

test('HTTP corruption is visible and cannot be overwritten by a paper order', async t => {
  const {base, directory} = await start(t);
  fs.mkdirSync(path.join(directory, 'data'));
  const file = path.join(directory, 'data/paper-trades.json');
  fs.writeFileSync(file, '{broken');
  assert.equal((await fetch(base+'/api/paper/trades')).status,503);
  const response = await fetch(base+'/api/paper/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:'BHP',entry:10,shares:60,stop:9.8,target:10.5,score:90})});
  assert.equal(response.status,400);
  assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});

test('HTTP scans record observations and learning reports remain pending', async t => {
  const {run,base} = await start(t);
  run(`buildMarketContext=async()=>({market:'Neutral'});
    getBars=async()=>({bars:[{date:'2026-11-06',close:10}],source:'test feed'});
    analyzeSymbol=symbol=>({symbol,score:40,price:10,priceAsOf:'2026-11-06',paperRules:{allowed:false}});`);
  assert.equal((await fetch(base+'/api/scan?symbols=BHP')).status,200);
  const report=await (await fetch(base+'/api/learning')).json();
  assert.equal(report.observations,1);
  assert.equal(report.completed10Session,0);
  assert.equal(report.automaticRuleChanges,false);
  const update=await fetch(base+'/api/learning/evaluate',{method:'POST'});
  assert.equal(update.status,200);
  assert.equal((await update.json()).comparison.status,'insufficient_evidence');
  const health=await (await fetch(base+'/health')).json();
  assert.equal(health.version,'stock-learner-v14-reliability-learning');
  assert.equal(health.storage.persistenceVerified,false);
});
