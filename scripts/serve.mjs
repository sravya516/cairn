// Tiny zero-dependency static server used for local testing.
// Usage: node scripts/serve.mjs <dir> <port> [basePath]
// With basePath (e.g. /cairn/) it mimics a GitHub Pages project site.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4173);
let base = process.argv[4] || '/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(base)) { res.writeHead(404); return res.end('Not found (outside base path)'); }
  p = p.slice(base.length);
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const file = path.join(dir, p);
  if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    // Service worker must always be revalidated, like GitHub Pages does (max-age=600).
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': p === 'sw.js' ? 'no-cache' : 'max-age=0' });
    res.end(data);
  });
}).listen(port, () => console.log(`Cairn dev server: http://localhost:${port}${base}  (serving ${dir})`));
