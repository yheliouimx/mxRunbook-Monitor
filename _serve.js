const http = require('http');
const fs = require('fs');
const path = require('path');
const mimes = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.yml': 'text/yaml', '.webp': 'image/webp',
};
http.createServer((req, res) => {
  let f = '.' + decodeURIComponent(req.url.split('?')[0]);
  if (f === './') f = './runbookDashboard.html';
  const ext = path.extname(f);
  fs.readFile(f, (e, d) => {
    if (e) {
      if (e.code === 'EISDIR') {
        try {
          const files = fs.readdirSync(f);
          const html = files.map(n => `<a href="${n}">${n}</a>`).join('\n');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        } catch (_) { res.writeHead(404); res.end('Not found'); }
        return;
      }
      res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(8090, () => console.log('Serving on http://localhost:8090'));

