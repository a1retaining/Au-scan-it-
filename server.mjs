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
    if (req.url === '/health' || req.url === '/keepalive') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, service: 'asx-trade-finder-frontend', time: new Date().toISOString(), api_proxy_target: Boolean(apiProxyTarget) }));
      return;
    }

    if (apiProxyTarget && apiRoutes.some((route) => (req.url || '').startsWith(route))) {
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

    let filePath = safeJoin(distDir, req.url || '/');
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': contentTypes[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
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
