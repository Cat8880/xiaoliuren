// 极简静态服务器：给手机微信访问用
// 用法：node serve.mjs [port] [dir]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.argv[2] || 8000);
const ROOT = resolve(process.argv[3] || fileURLToPath(new URL('./', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = urlPath.replace(/^\/+/, '');
    if (rel === '') rel = 'index.html';
    const file = resolve(join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403 forbidden');
      return;
    }
    const st = await stat(file);
    if (st.isDirectory()) {
      const idx = resolve(join(file, 'index.html'));
      const body = await readFile(idx);
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
      res.end(body); return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + (e.code || e.message));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
  }
  console.log(`serving ${ROOT}`);
  console.log(`  local : http://127.0.0.1:${PORT}/`);
  for (const ip of ips) console.log(`  LAN   : http://${ip}:${PORT}/`);
});
