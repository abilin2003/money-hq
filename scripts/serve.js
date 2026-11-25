// A tiny static file server for previewing the app and for the tests.
// It never serves data/, tests/, scripts/, reference/ or node_modules/, so private files stay private.
// Run with: npm run legacy   (then open http://localhost:8080)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'legacy'); // the previous app (Phase 1 moves it here)
const port = Number(process.argv[2]) || 8080;
const BLOCKED = /^(node_modules|\.git|data|tests|scripts|reference)(\/|\\|$)/;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const rel = path.normalize(pathname).replace(/^[\\/]+/, '');
    const file = path.join(root, rel);
    if (!file.startsWith(root) || BLOCKED.test(rel)) throw new Error('blocked');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, () => {
  console.log(`Money HQ preview: http://localhost:${port}`);
});
