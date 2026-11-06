const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');

exports.loadServer = function (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-learner-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const serverPath = path.resolve(__dirname, '../server.js');
  const context = vm.createContext({
    require: createRequire(serverPath), __dirname: directory,
    process: { env: { STOCK_DATA_DIR: path.join(directory, 'data') }, uptime: () => 0 },
    console, Buffer, setTimeout, clearTimeout, URL, AbortController,
    fetch: () => { throw new Error('Unexpected network access in test'); },
    module: { exports: {} }
  });
  const source = fs.readFileSync(serverPath, 'utf8')
    .replace(/app\.listen\(PORT, [\s\S]*$/, '');
  vm.runInContext(source, context, { filename: serverPath });
  return { context, directory, run: (code) => vm.runInContext(code, context) };
};

exports.marketFixture = `
const fixtureBars = Array.from({ length: 235 }, (_, i) => ({
  date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
  open: 10, high: 10.5, low: 9.8, close: 10, volume: 100000
}));
getBars = async () => ({ bars: fixtureBars, source: 'test market feed' });
analyzeSymbol = (symbol, bars) => ({
  symbol, price: 10, score: 90, riskReward: 2, distanceToBuyZonePct: 0,
  stopLoss: 9, target1: 12, paperRules: { allowed: bars.length === 231 }
});
const fixtureParams = getBacktestParams({query: {risk: 100, slippageBps: 0}});
`;
