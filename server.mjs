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
      res.end(JSON.stringify({ ok: true, service: 'asx-trade-finder-frontend', build_id: 'AU-ASX-INSTITUTIONAL-DESK-V20', time: new Date().toISOString(), api_proxy_target: Boolean(apiProxyTarget) }));
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
      const fallbackSignals = [
        { ticker: 'CBA', name: 'Commonwealth Bank', sector: 'Banks', score: 88, confidence: 82, status: 'REVIEW', setup: 'Pullback to value', price: 123.40, entry: 123.20, stop: 119.80, target: 132.70, rr: 2.79, volume_multiple: 1.3, key_zone: '$122.40 to $124.10', reasons: ['Local fallback candidate', 'Trend structure still positive', 'Needs backend/data provider for live scan'], risks: ['Not live provider data', 'Review only until backend is connected'] },
        { ticker: 'BHP', name: 'BHP Group', sector: 'Materials', score: 84, confidence: 78, status: 'REVIEW', setup: 'Breakout watch', price: 45.12, entry: 45.30, stop: 43.70, target: 49.10, rr: 2.38, volume_multiple: 1.1, key_zone: '$44.90 to $45.40', reasons: ['Local fallback candidate', 'Materials watchlist candidate'], risks: ['Not live provider data', 'Needs iron ore confirmation'] },
        { ticker: 'WES', name: 'Wesfarmers', sector: 'Consumer', score: 72, confidence: 67, status: 'WATCH', setup: 'Base forming', price: 67.80, entry: 68.50, stop: 66.20, target: 72.80, rr: 1.87, volume_multiple: 0.9, key_zone: '$67.90 to $68.70', reasons: ['Local fallback candidate'], risks: ['Reward is below 2R'] },
        { ticker: 'CSL', name: 'CSL Limited', sector: 'Healthcare', score: 51, confidence: 48, status: 'BLOCKED', setup: 'Weak relative strength', price: 284.10, entry: 291.00, stop: 279.00, target: 306.00, rr: 1.25, volume_multiple: 0.8, key_zone: 'No clean buy zone', reasons: ['Local fallback candidate'], risks: ['Sector weak', 'No entry trigger'] }
      ];
      const json = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(payload));
      };
      if (pathname === '/signals' || pathname === '/refresh') {
        json(200, { mode: 'local_frontend_fallback', message: 'No backend API proxy is configured. Showing safe review candidates only.', refreshed_at: new Date().toISOString(), count: fallbackSignals.length, signals: fallbackSignals });
        return;
      }
      if (pathname === '/market-clock') {
        json(200, { session: 'Closed', is_open: false, seconds_to_open: 0, seconds_to_close: 0, now_sydney: new Date().toISOString(), message: 'Local fallback market clock. Connect backend for Australia/Sydney session clock.' });
        return;
      }
      if (pathname === '/paper') {
        json(200, { starting_cash: 5000, cash: 5000, equity: 5000, open_risk: 0, open_positions: [], closed_trades: [], mode: 'local_frontend_fallback' });
        return;
      }
      if (pathname.startsWith('/prices/')) {
        const ticker = decodeURIComponent(pathname.split('/').pop() || 'ASX');
        const base = ticker === 'BHP' ? 45 : ticker === 'CSL' ? 284 : ticker === 'WES' ? 68 : 123;
        const prices = Array.from({ length: 80 }, (_, i) => {
          const price = base + i * 0.05 + Math.sin(i / 5) * 1.2;
          return { date: i + 1, close: Number(price.toFixed(2)), ma20: Number((price - 0.55).toFixed(2)), volume: Math.round(700000 + i * 2000) };
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
