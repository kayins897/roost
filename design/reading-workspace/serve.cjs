const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = __dirname;
const port = Number(process.argv[2] || 4186);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
http.createServer((req, res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400); res.end(); }
}).listen(port, '127.0.0.1', () => console.log('Reading preview: http://127.0.0.1:' + port));
