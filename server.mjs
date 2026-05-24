import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'frontend', 'dist');
const port = Number(process.env.PORT || 10000);
const apiProxyTarget = process.env.API_PROXY_TARGET || process.env.VITE_API_BASE_URL || "";
const apiRoutes = ["/health-api", "/keepalive-api", "/market-clock", "/signals", "/refresh", "/prices/", "/paper"];

function sydneyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

function sydneyOffsetMs(date = new Date()) {
  const p = sydneyParts(date);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - date.getTime();
}

function sydLocalToUtc(y, m, d, hh, mm, ss = 0) {
  const rough = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  return new Date(rough.getTime() - sydneyOffsetMs(rough));
}

function nextWeekdayDate(y, m, d, addDays = 0) {
  let dt = new Date(Date.UTC(y, m - 1, d + addDays, 12));
  while ([0, 6].includes(dt.getUTCDay())) dt = new Date(dt.getTime() + 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function marketClock() {
  const now = new Date();
  const p = sydneyParts(now);
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  const weekday = p.weekday;
  const todayOpen = sydLocalToUtc(y, m, d, 10, 0);
  const todayClose = sydLocalToUtc(y, m, d, 16, 0);
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const isOpen = isWeekday && now >= todayOpen && now < todayClose;
  let nextOpen = todayOpen;
  let nextClose = todayClose;
  if (isOpen) {
    nextClose = todayClose;
  } else if (!isWeekday || now >= todayClose) {
    const nd = nextWeekdayDate(y, m, d, 1);
    nextOpen = sydLocalToUtc(nd.y, nd.m, nd.d, 10, 0);
    nextClose = sydLocalToUtc(nd.y, nd.m, nd.d, 16, 0);
  } else if (now < todayOpen) {
    nextOpen = todayOpen;
  }
  return {
    session: isOpen ? "Open" : "Closed",
    is_open: isOpen,
    seconds_to_open: isOpen ? 0 : Math.max(0, Math.floor((nextOpen.getTime() - now.getTime()) / 1000)),
    seconds_to_close: isOpen ? Math.max(0, Math.floor((nextClose.getTime() - now.getTime()) / 1000)) : 0,
    now_sydney: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} Australia/Sydney`,
    next_open_sydney: nextOpen.toISOString(),
    next_close_sydney: nextClose.toISOString(),
  };
}


const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(base, requestedPath) {
  const decoded = decodeURIComponent(requestedPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^([.][.][\/\\])+/, '');
  const finalPath = path.join(base, normalized === '/' ? 'index.html' : normalized);
  return finalPath.startsWith(base) ? finalPath : path.join(base, 'index.html');
}

const server = createServer(async (req, res) => {
  try {
    if (req.url === '/health' || req.url === '/keepalive' || req.url === '/version') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, service: 'asx-trade-finder-frontend', build_id: 'AU-ASX-INSTITUTIONAL-DESK-V21', time: new Date().toISOString(), api_proxy_target: Boolean(apiProxyTarget) }));
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (apiProxyTarget && apiRoutes.some((route) => pathname.startsWith(route))) {
      const apiPath = (req.url || '').replace(/^\/health-api/, '/health').replace(/^\/keepalive-api/, '/keepalive');
      const target = new URL(apiPath, apiProxyTarget);
      const proxied = await fetch(target, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] || 'application/json' },
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : req,
        duplex: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : 'half',
      });
      const body = await proxied.arrayBuffer();
      res.writeHead(proxied.status, { 'content-type': proxied.headers.get('content-type') || 'application/json; charset=utf-8' });
      res.end(Buffer.from(body));
      return;
    }

    // Safe local API fallback. This stops the frontend from receiving index.html for
    // /signals, /paper, /market-clock or /prices when Render is running only the
    // frontend service without a backend API proxy. It keeps the desk usable for
    // review mode while clearly marking the data as local fallback.
    if (!apiProxyTarget && apiRoutes.some((route) => pathname.startsWith(route))) {
      const baseSignals = [
        ['CBA','Commonwealth Bank','Banks',88,'REVIEW','Pullback to value',123.40,123.20,119.80,132.70,'$122.40 to $124.10'],
        ['BHP','BHP Group','Materials',84,'REVIEW','Breakout watch',45.12,45.30,43.70,49.10,'$44.90 to $45.40'],
        ['NAB','National Australia Bank','Banks',82,'REVIEW','Higher-low continuation',34.80,35.10,33.90,38.20,'$34.80 to $35.20'],
        ['RIO','Rio Tinto','Materials',80,'REVIEW','Base breakout watch',128.20,129.00,124.40,139.80,'$128.40 to $129.30'],
        ['WBC','Westpac','Banks',78,'WATCH','Pullback watch',27.90,28.20,27.10,30.50,'$27.90 to $28.30'],
        ['FMG','Fortescue','Materials',76,'WATCH','Commodity pullback',24.60,24.90,23.70,27.50,'$24.50 to $25.00'],
        ['NEM','Newmont','Gold',77,'WATCH','Gold strength pullback',72.20,72.80,69.90,79.40,'$72.00 to $73.00'],
        ['MQG','Macquarie Group','Financials',79,'WATCH','Trend continuation',203.40,205.00,197.50,221.00,'$203.50 to $205.40'],
        ['WES','Wesfarmers','Consumer',72,'WATCH','Base forming',67.80,68.50,66.20,72.80,'$67.90 to $68.70'],
        ['XRO','Xero','Technology',74,'WATCH','Momentum reset',128.60,130.00,124.80,141.20,'$128.50 to $130.20'],
        ['GMG','Goodman Group','REITs',69,'WATCH','Rate-sensitive base',33.40,33.80,32.50,36.50,'$33.40 to $33.90'],
        ['WDS','Woodside Energy','Energy',66,'WATCH','Range reclaim',29.70,30.10,28.90,32.80,'$29.80 to $30.20'],
        ['TLS','Telstra','Communications',62,'WATCH','Slow trend watch',3.95,4.02,3.86,4.38,'$3.96 to $4.03'],
        ['CSL','CSL Limited','Healthcare',51,'BLOCKED','Weak relative strength',284.10,291.00,279.00,306.00,'No clean buy zone'],
        ['WOW','Woolworths','Staples',58,'BLOCKED','Defensive laggard',31.20,31.80,30.40,34.40,'No clean buy zone'],
        ['PLS','Pilbara Minerals','Lithium',42,'BLOCKED','Weak sector',3.10,3.25,2.98,3.85,'Blocked until lithium improves'],
        ['MIN','Mineral Resources','Lithium',44,'BLOCKED','Weak sector bounce',36.20,37.10,34.80,41.00,'Blocked until sector improves'],
        ['RMD','ResMed','Healthcare',63,'WATCH','Recovery watch',31.40,31.90,30.20,35.10,'$31.30 to $32.00'],
        ['QAN','Qantas','Industrials',61,'WATCH','Range watch',6.20,6.32,5.98,6.95,'$6.20 to $6.35'],
        ['ALL','Aristocrat Leisure','Consumer',70,'WATCH','Trend pullback',52.40,53.00,50.70,57.80,'$52.50 to $53.20']
      ];
      const fallbackSignals = baseSignals.map(([ticker, name, sector, score, status, setup, price, entry, stop, target, key_zone], index) => ({
        ticker, name, sector, score, confidence: Math.max(35, score - 6), status, setup, price, entry, stop, target,
        rr: Number(((target - entry) / Math.max(entry - stop, 0.01)).toFixed(2)), volume_multiple: Number((0.75 + (index % 7) * 0.08).toFixed(2)), key_zone,
        reasons: ['Local fallback review candidate', 'Connect backend/data provider for live scan', `${sector} watchlist member`],
        risks: status === 'BLOCKED' ? ['Blocked by setup quality or sector flow', 'Review only, no entry'] : ['Not live provider data', 'Review only until backend is connected']
      }));
      const json = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(payload));
      };
      if (pathname === '/signals' || pathname === '/refresh') {
        json(200, { mode: 'local_frontend_fallback', message: 'No backend API proxy is configured. Showing safe review candidates only.', refreshed_at: new Date().toISOString(), count: fallbackSignals.length, signals: fallbackSignals });
        return;
      }
      if (pathname === '/market-clock') {
        json(200, { ...marketClock(), message: 'Local fallback ASX market clock. Holidays are not included until backend calendar is connected.' });
        return;
      }
      if (pathname === '/paper') {
        json(200, { starting_cash: 5000, cash: 5000, equity: 5000, open_risk: 0, open_positions: [], closed_trades: [], mode: 'local_frontend_fallback' });
        return;
      }
      if (pathname.startsWith('/prices/')) {
        const ticker = decodeURIComponent(pathname.split('/').pop() || 'ASX');
        const match = fallbackSignals.find((x) => x.ticker === ticker);
        const base = match ? match.entry : 100;
        const h = String(ticker).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const phase = (h % 17) / 2.7;
        const amp = 0.45 + (h % 9) * 0.13;
        const trend = ((h % 13) - 4) * 0.018;
        let price = base * (0.94 + (h % 5) * 0.012);
        let ma20 = price;
        const prices = Array.from({ length: 100 }, (_, i) => {
          price = price + trend + (Math.sin((i + phase) / (3.5 + (h % 4))) + Math.cos((i + phase) / (6.5 + (h % 5)))) * amp * 0.12;
          ma20 = ma20 * 0.88 + price * 0.12;
          return { date: i + 1, close: Number(price.toFixed(2)), ma20: Number(ma20.toFixed(2)), volume: Math.round(550000 + ((Math.sin(i / 2 + phase) + 1) * 140000) + i * (800 + (h % 8) * 100)) };
        });
        json(200, { ticker, mode: 'local_frontend_fallback', prices });
        return;
      }
      if (pathname === '/paper/enter' || pathname === '/paper/exit') {
        json(423, { ok: false, error: 'Paper execution requires backend API. Set API_PROXY_TARGET to your backend Render URL.' });
        return;
      }
      json(404, { ok: false, error: 'Unknown local fallback API route' });
      return;
    }

    let filePath = safeJoin(distDir, req.url || '/');
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': contentTypes[ext] || 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'pragma': 'no-cache',
      'expires': '0',
    });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Frontend server error: ${error.message}`);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`ASX Trade Finder frontend listening on 0.0.0.0:${port}`);
  console.log(`Serving ${distDir}`);
});
